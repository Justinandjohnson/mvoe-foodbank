from __future__ import annotations

import logging
import uuid
from urllib.parse import urlencode

from fastapi import APIRouter, Form, Header, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.db import get_db
from app.models.sms import OptInLog, SmsMessage
from app.models.volunteer import Volunteer
from app.services.twilio_sms import twilio_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

_TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response/>'
_HELP_TEXT = (
    "Hope Pantry reminders: Reply Y to confirm a shift, N to decline, "
    "STOP to unsubscribe. Questions? Call your pantry coordinator."
)


def _twiml(msg: str) -> Response:
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{msg}</Message></Response>'
    return Response(content=twiml, media_type="application/xml")


@router.post("/twilio/inbound")
async def twilio_inbound(
    request: Request,
    x_twilio_signature: str = Header(default=""),
    From: str = Form(...),
    Body: str = Form(...),
    MessageSid: str = Form(...),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Receive inbound SMS from Twilio and route YES/NO/STOP/HELP replies.

    Validates Twilio signature to prevent spoofing. Routes to the correct
    tenant using the conversation_state table keyed on (phone_e164, tenant_id).
    """
    # Validate Twilio webhook signature
    form_data = dict(await request.form())
    url = str(request.url)
    if not twilio_service.validate_webhook(url, {k: str(v) for k, v in form_data.items()}, x_twilio_signature):
        logger.warning("Invalid Twilio signature from %s", From)
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    body_upper = Body.strip().upper()
    phone = From.strip()

    # Look up which tenant this phone belongs to via conversation_state
    state_result = await db.execute(
        text("SELECT tenant_id, state, context FROM conversation_state WHERE phone_e164 = :phone LIMIT 1"),
        {"phone": phone},
    )
    state_row = state_result.first()

    # Route STOP immediately regardless of state — TCPA requirement
    if body_upper in ("STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"):
        await _handle_optout(phone, state_row, db)
        # STOP is handled by Twilio carrier; we must return empty TwiML
        return Response(content=_TWIML_OK, media_type="application/xml")

    if body_upper == "HELP":
        await _log_opt_in_action(phone, "help", state_row, str(request.client.host) if request.client else None, db)
        return _twiml(_HELP_TEXT)

    if body_upper in ("Y", "YES"):
        return await _handle_confirm(phone, state_row, db)

    if body_upper in ("N", "NO"):
        return await _handle_decline(phone, state_row, db)

    # Unknown reply — send a gentle prompt
    return _twiml("Reply Y to confirm your shift or N to cancel. Reply STOP to unsubscribe.")


async def _handle_confirm(phone: str, state_row: object, db: AsyncSession) -> Response:
    if state_row is None:
        return _twiml("Thanks! We don't have an active shift for you right now.")

    tenant_id = str(state_row[0])  # type: ignore[index]
    context = state_row[2] or {}  # type: ignore[index]
    signup_id = context.get("pending_signup_id")

    if signup_id:
        await db.execute(
            text("UPDATE signups SET status = 'confirmed' WHERE id = :id AND tenant_id = :tid"),
            {"id": signup_id, "tid": tenant_id},
        )
        await db.execute(
            text("UPDATE conversation_state SET state = 'confirmed', updated_at = now() "
                 "WHERE phone_e164 = :phone AND tenant_id = :tid"),
            {"phone": phone, "tid": tenant_id},
        )
        await db.commit()
        return _twiml("You're confirmed. See you Saturday!")

    return _twiml("Confirmed! See you at your next shift.")


async def _handle_decline(phone: str, state_row: object, db: AsyncSession) -> Response:
    if state_row is None:
        return _twiml("Got it, no problem.")

    tenant_id = str(state_row[0])  # type: ignore[index]
    context = state_row[2] or {}  # type: ignore[index]
    signup_id = context.get("pending_signup_id")

    if signup_id:
        await db.execute(
            text("UPDATE signups SET status = 'declined' WHERE id = :id AND tenant_id = :tid"),
            {"id": signup_id, "tid": tenant_id},
        )
        await db.execute(
            text("UPDATE conversation_state SET state = 'declined', updated_at = now() "
                 "WHERE phone_e164 = :phone AND tenant_id = :tid"),
            {"phone": phone, "tid": tenant_id},
        )
        await db.commit()

    return _twiml("No worries, we'll find a replacement. Thank you for letting us know.")


async def _handle_optout(phone: str, state_row: object, db: AsyncSession) -> None:
    tenant_id = str(state_row[0]) if state_row else None  # type: ignore[index]

    # Mark volunteer as stopped
    await db.execute(
        text("UPDATE volunteers SET opt_in_state = 'stopped' WHERE phone_e164 = :phone"
             + (" AND tenant_id = :tid" if tenant_id else "")),
        {"phone": phone, **({"tid": tenant_id} if tenant_id else {})},
    )

    if tenant_id:
        opt_log = OptInLog(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(tenant_id),
            phone_e164=phone,
            action="optout",
            consent_text_shown="STOP received",
        )
        db.add(opt_log)

    await db.commit()
    logger.info("STOP received from %s — opt_in_state set to stopped", phone)


async def _log_opt_in_action(
    phone: str, action: str, state_row: object, source_ip: str | None, db: AsyncSession
) -> None:
    tenant_id = str(state_row[0]) if state_row else None  # type: ignore[index]
    if not tenant_id:
        return

    log = OptInLog(
        id=uuid.uuid4(),
        tenant_id=uuid.UUID(tenant_id),
        phone_e164=phone,
        action=action,
        source_ip=source_ip,
    )
    db.add(log)
    await db.commit()


@router.post("/twilio/status")
async def twilio_status(
    MessageSid: str = Form(...),
    MessageStatus: str = Form(...),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Update delivery status on the sms_messages audit record."""
    # sms_messages is immutable — we use a raw UPDATE via text() to set status only
    # (the RULE blocks UPDATE via ORM but direct SQL bypasses application-layer rules;
    # at DB level the RULE uses INSTEAD NOTHING so we track status separately here
    # by upserting a delivery_status shadow table — simplified for MVP: just log it)
    logger.info("Twilio status callback: sid=%s status=%s", MessageSid, MessageStatus)
    return {"received": "ok"}
