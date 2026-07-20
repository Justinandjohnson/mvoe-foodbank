from __future__ import annotations

import random
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.encryption import decrypt_secret
from app.models.event import Event, Signup
from app.models.sms import AiCall, SmsMessage
from app.models.tenant import Tenant
from app.models.volunteer import Volunteer
from app.schemas.event import EventCreate, EventOut, ReminderDraft, RosterResponse, SignupOut
from app.services.openrouter import MODEL_DRAFT, OpenRouterClient

router = APIRouter(prefix="/events", tags=["events"])

_REMINDER_SYSTEM = (
    "You are drafting a brief, warm SMS reminder for a food pantry volunteer. "
    "Return exactly one SMS body under 140 characters. "
    "Be specific about the event, time, and response needed. No emoji, no hashtags, no quotation marks, no markdown. "
    "Use plain, friendly language and end with a direct confirmation cue if appropriate. "
    "Do not include a salutation or pantry name — the platform prepends that automatically."
)


@router.get("", response_model=list[EventOut])
async def list_events(db: AsyncSession = Depends(get_db)) -> list[EventOut]:
    result = await db.execute(select(Event))
    events = result.scalars().all()
    return [EventOut.model_validate(e) for e in events]


@router.post("", response_model=EventOut, status_code=201)
async def create_event(
    body: EventCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EventOut:
    tenant_id: uuid.UUID = uuid.UUID(str(request.state.tenant_id))
    event = Event(id=uuid.uuid4(), tenant_id=tenant_id, **body.model_dump())
    db.add(event)
    await db.commit()
    return EventOut.model_validate(event)


@router.get("/{event_id}/roster", response_model=RosterResponse)
async def get_roster(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> RosterResponse:
    result = await db.execute(select(Signup).where(Signup.event_id == event_id))
    signups = result.scalars().all()
    return RosterResponse(
        event_id=event_id,
        signups=[SignupOut.model_validate(s) for s in signups],
        confirmed=sum(1 for s in signups if s.status == "confirmed"),
        pending=sum(1 for s in signups if s.status == "invited"),
        declined=sum(1 for s in signups if s.status == "declined"),
    )


@router.post("/{event_id}/reminders/draft", response_model=list[ReminderDraft])
async def draft_reminders(
    event_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[ReminderDraft]:
    """
    Deterministic Layer 1 pipeline: fetch invited volunteers for this event,
    call OpenRouter Claude Haiku once per volunteer to personalize a reminder,
    and return drafts for director approval.

    A/B arm is randomly assigned here and recorded on the signup row.
    """
    # Load event
    event_result = await db.execute(select(Event).where(Event.id == event_id))
    event = event_result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Load tenant's OpenRouter key
    tenant_id = str(request.state.tenant_id)
    from app.models.tenant import Tenant as TenantModel  # avoid circular at module level
    from sqlalchemy import text as sa_text

    secret_row = await db.execute(
        sa_text(
            "SELECT ciphertext FROM tenant_secrets "
            "WHERE tenant_id = :tid AND key_name = 'openrouter_api_key' "
            "ORDER BY key_version DESC LIMIT 1"
        ),
        {"tid": tenant_id},
    )
    secret = secret_row.first()
    if not secret:
        raise HTTPException(
            status_code=422,
            detail="OpenRouter API key not configured. Add it in Settings.",
        )
    api_key = decrypt_secret(secret[0]).reveal()

    # Load invited signups with their volunteers
    signups_result = await db.execute(
        select(Signup, Volunteer)
        .join(Volunteer, Volunteer.id == Signup.volunteer_id)
        .where(Signup.event_id == event_id, Signup.status == "invited")
        .where(Volunteer.opt_in_state == "active")
    )
    rows = signups_result.all()
    if not rows:
        return []

    client = OpenRouterClient(api_key=api_key)
    drafts: list[ReminderDraft] = []

    for signup, volunteer in rows:
        # Assign A/B arm: ai or generic
        arm = "ai" if random.random() < 0.5 else "generic"

        if arm == "ai":
            messages = [
                {
                    "role": "user",
                    "content": (
                        f"Volunteer name: {volunteer.name}. "
                        f"Event: {event.title}. "
                        f"Date/time: {event.starts_at.strftime('%A %B %-d at %-I:%M %p')}. "
                        f"Location: {event.location or 'the usual location'}. "
                        "Write one SMS reminder under 140 characters."
                    ),
                }
            ]
            draft_body = await client.chat_complete_with_fallback(
                messages=messages,
                model=MODEL_DRAFT,
                system=_REMINDER_SYSTEM,
                max_tokens=60,
            )
            # Record AI call for cost tracking (approximate token counts)
            ai_call = AiCall(
                id=uuid.uuid4(),
                tenant_id=event.tenant_id,
                model=MODEL_DRAFT,
                prompt_tokens=80,
                completion_tokens=30,
                cost_cents=0,  # updated async by OpenRouter usage callback in Phase 2
                purpose="reminder_draft",
                ref_id=signup.id,
            )
            db.add(ai_call)
        else:
            draft_body = (
                f"Hi {volunteer.name}, you're signed up for {event.title} "
                f"on {event.starts_at.strftime('%A at %-I:%M %p')}. "
                "Reply Y to confirm or N if you can't make it."
            )

        # Update signup with A/B arm assignment
        signup.ab_arm = arm
        drafts.append(
            ReminderDraft(
                volunteer_id=volunteer.id,
                volunteer_name=volunteer.name,
                phone_e164=volunteer.phone_e164,
                draft_body=draft_body,
                ab_arm=arm,
            )
        )

    await db.commit()
    return drafts
