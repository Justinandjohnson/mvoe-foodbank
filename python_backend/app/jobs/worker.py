from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

import procrastinate
from sqlalchemy import text

from app.config import settings

logger = logging.getLogger(__name__)

app = procrastinate.App(
    connector=procrastinate.SyncPsycopg2Connector(json_dumps=None),
)

# Use async connector for FastAPI
async_app = procrastinate.App(
    connector=procrastinate.AiopgConnector(),
)


@async_app.task
async def send_reminder_batch(event_id: str, tenant_id: str) -> None:
    """
    Layer 1 deterministic reminder fanout.

    For each opted-in volunteer on an event's invited list:
    1. Draft a personalized SMS via OpenRouter Claude Haiku
    2. Send via Twilio
    3. Log to sms_messages (immutable TCPA record)

    This task is enqueued by check_upcoming_reminders at T-3d, T-1d, T-2h.
    """
    from app.db import AsyncSessionLocal
    from app.encryption import decrypt_secret
    from app.models.sms import SmsMessage
    from app.services.openrouter import MODEL_DRAFT, OpenRouterClient
    from app.services.twilio_sms import twilio_service

    logger.info("send_reminder_batch: event_id=%s tenant_id=%s", event_id, tenant_id)

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET LOCAL app.tenant_id = '{tenant_id}'"))

        # Load event details
        event_result = await db.execute(
            text("SELECT title, starts_at, location FROM events WHERE id = :id"),
            {"id": event_id},
        )
        event = event_result.first()
        if not event:
            logger.error("Event %s not found", event_id)
            return

        # Load tenant's OpenRouter key
        secret_result = await db.execute(
            text(
                "SELECT ciphertext FROM tenant_secrets "
                "WHERE tenant_id = :tid AND key_name = 'openrouter_api_key' "
                "ORDER BY key_version DESC LIMIT 1"
            ),
            {"tid": tenant_id},
        )
        secret = secret_result.first()
        if not secret:
            logger.error("No OpenRouter key for tenant %s — skipping reminders", tenant_id)
            return

        api_key = decrypt_secret(secret[0]).reveal()

        # Load tenant name for SMS prefix
        tenant_result = await db.execute(
            text("SELECT name FROM tenants WHERE id = :tid"),
            {"tid": tenant_id},
        )
        tenant = tenant_result.first()
        pantry_name = tenant[0] if tenant else "Your Pantry"

        # Load invited, opted-in volunteers
        volunteers_result = await db.execute(
            text(
                "SELECT v.id, v.name, v.phone_e164, s.id AS signup_id, s.ab_arm "
                "FROM signups s "
                "JOIN volunteers v ON v.id = s.volunteer_id "
                "WHERE s.event_id = :event_id "
                "AND s.status = 'invited' "
                "AND v.opt_in_state = 'active'"
            ),
            {"event_id": event_id},
        )
        volunteers = volunteers_result.fetchall()

        if not volunteers:
            logger.info("No eligible volunteers for event %s", event_id)
            return

        client = OpenRouterClient(api_key=api_key)
        event_title, starts_at, location = event

        for vol_id, vol_name, phone, signup_id, ab_arm in volunteers:
            try:
                if ab_arm == "ai":
                    messages = [
                        {
                            "role": "user",
                            "content": (
                                f"Volunteer name: {vol_name}. "
                                f"Event: {event_title}. "
                                f"Date/time: {starts_at.strftime('%A %B %-d at %-I:%M %p')}. "
                                f"Location: {location or 'the usual location'}. "
                                "Write one SMS reminder under 140 characters. No emoji. Full sentences."
                            ),
                        }
                    ]
                    body = await client.chat_complete_with_fallback(
                        messages=messages,
                        model=MODEL_DRAFT,
                        system=(
                            "Draft a brief, warm SMS reminder for a food pantry volunteer. "
                            "Under 140 characters. No salutation."
                        ),
                        max_tokens=60,
                    )
                    ai_model = MODEL_DRAFT
                else:
                    body = (
                        f"Hi {vol_name}, you're signed up for {event_title} "
                        f"on {starts_at.strftime('%A at %-I:%M %p')}. "
                        "Reply Y to confirm or N if you can't make it."
                    )
                    ai_model = None

                result = twilio_service.send_sms(to=phone, body=body, pantry_name=pantry_name)

                # Record in immutable TCPA audit log
                sms = SmsMessage(
                    id=uuid.uuid4(),
                    tenant_id=uuid.UUID(tenant_id),
                    volunteer_id=uuid.UUID(str(vol_id)),
                    direction="out",
                    twilio_sid=result["twilio_sid"],
                    body=f"{pantry_name}: {body}",
                    status=result["status"],
                    template_key="reminder_t_minus",
                    ai_model=ai_model,
                )
                db.add(sms)

                # Update conversation_state so inbound Y/N replies route correctly
                await db.execute(
                    text(
                        "INSERT INTO conversation_state (phone_e164, tenant_id, state, context, updated_at) "
                        "VALUES (:phone, :tid, 'awaiting_confirm', :ctx::jsonb, now()) "
                        "ON CONFLICT (phone_e164, tenant_id) DO UPDATE "
                        "SET state = 'awaiting_confirm', context = :ctx::jsonb, updated_at = now()"
                    ),
                    {
                        "phone": phone,
                        "tid": tenant_id,
                        "ctx": f'{{"pending_signup_id": "{signup_id}"}}',
                    },
                )

            except Exception:
                logger.exception("Failed to send reminder to %s for event %s", phone, event_id)

        await db.commit()
        logger.info("Reminder batch complete: event=%s volunteers=%d", event_id, len(volunteers))


@async_app.periodic(cron="0 * * * *")  # Every hour
async def check_upcoming_reminders() -> None:
    """
    Scan for events needing reminders at T-3 days, T-1 day, T-2 hours.
    Enqueues send_reminder_batch tasks for eligible events.
    """
    from app.db import AsyncSessionLocal

    now = datetime.now(tz=timezone.utc)
    windows = [
        ("t_minus_3d", timedelta(days=3), timedelta(hours=1)),
        ("t_minus_1d", timedelta(days=1), timedelta(hours=1)),
        ("t_minus_2h", timedelta(hours=2), timedelta(minutes=30)),
    ]

    async with AsyncSessionLocal() as db:
        for window_name, delta, tolerance in windows:
            target_start = now + delta
            target_end = target_start + tolerance

            result = await db.execute(
                text(
                    "SELECT e.id, e.tenant_id "
                    "FROM events e "
                    "WHERE e.starts_at >= :start AND e.starts_at < :end "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM sms_messages sm "
                    "  WHERE sm.template_key = :window "
                    "  AND sm.tenant_id = e.tenant_id "
                    "  AND sm.sent_at > now() - interval '2 hours'"
                    ")"
                ),
                {"start": target_start, "end": target_end, "window": window_name},
            )
            events = result.fetchall()

            for event_id, tenant_id in events:
                logger.info("Scheduling %s reminders: event=%s tenant=%s", window_name, event_id, tenant_id)
                await send_reminder_batch.defer_async(
                    event_id=str(event_id),
                    tenant_id=str(tenant_id),
                )
