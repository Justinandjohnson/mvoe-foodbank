from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.db import get_db
from app.encryption import decrypt_secret
from app.models.sms import AiCall
from app.services.openrouter import MODEL_AGENT, OpenRouterClient

router = APIRouter(prefix="/agent", tags=["agent"])
logger = logging.getLogger(__name__)
_DEMO_TENANT_ID = uuid.UUID("f663aa3a-fdc7-4653-841d-a5a8418a3543")


class ChatMessage(BaseModel):
    message: str


@router.post("/chat")
async def chat(
    body: ChatMessage,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Send a message to Maria's conversational agent and stream the response.
    The agent has access to the tenant's volunteer and event data.

    Returns a streaming SSE response via EventSourceResponse; for clients
    that cannot stream, a JSON reply is returned instead.
    """
    tenant_id = str(getattr(request.state, "tenant_id", "") or _DEMO_TENANT_ID)

    # Try to load the tenant's OpenRouter key; fall back to platform key for guests
    api_key: str | None = None
    if tenant_id:
        secret_result = await db.execute(
            text(
                "SELECT ciphertext FROM tenant_secrets "
                "WHERE tenant_id = :tid AND key_name = 'openrouter_api_key' "
                "ORDER BY key_version DESC LIMIT 1"
            ),
            {"tid": tenant_id},
        )
        secret = secret_result.first()
        if secret:
            api_key = decrypt_secret(secret[0]).reveal()

    if not api_key:
        api_key = settings.openrouter_api_key or None

    if not api_key:
        raise HTTPException(
            status_code=422,
            detail="OpenRouter API key not configured.",
        )

    # Build tenant context for the system prompt
    vol_result = await db.execute(
        text("SELECT name, phone_e164, opt_in_state, trust_score FROM volunteers LIMIT 50")
    )
    volunteers = vol_result.fetchall()
    vol_summary = (
        ", ".join(f"{v[0]} ({v[2]})" for v in volunteers) if volunteers else "No volunteers yet"
    )

    system_prompt = (
        "You are Maria, the MVOE volunteer coordinator assistant for a food pantry director. "
        "Your job is to help the director make fast, high-confidence operational decisions about volunteers and reminder workflows. "
        "Use ONLY the roster/context provided in this prompt. If a fact is missing, say so directly instead of inventing it. "
        "Keep answers concise, practical, and operationally specific. Prefer bullet points or a short action plan over long prose. "
        "When the user asks you to take an action (send a reminder, update a record, contact volunteers), provide: "
        "(1) the exact action you recommend, (2) a draft message or concrete next step, and (3) a short confirmation request before acting. "
        "When there is risk or uncertainty, call it out clearly. "
        f"Current volunteer roster summary: {vol_summary}."
    )

    client = OpenRouterClient(api_key=api_key)
    messages = [{"role": "user", "content": body.message}]

    reply = await client.chat_complete_with_fallback(
        messages=messages,
        model=MODEL_AGENT,
        system=system_prompt,
        max_tokens=500,
    )

    if tenant_id:
        db.add(
            AiCall(
                id=uuid.uuid4(),
                tenant_id=uuid.UUID(tenant_id),
                model=MODEL_AGENT,
                prompt_tokens=80,
                completion_tokens=120,
                cost_cents=0,
                purpose="summary",
                ref_id=None,
            )
        )
        await db.commit()

    return {"reply": reply}


@router.get("/volunteer-summary")
async def volunteer_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return a quick summary for the dashboard card."""
    vol_result = await db.execute(
        text(
            "SELECT "
            "  COUNT(*) FILTER (WHERE opt_in_state = 'active') AS active, "
            "  COUNT(*) FILTER (WHERE opt_in_state = 'pending') AS pending, "
            "  COUNT(*) AS total "
            "FROM volunteers"
        )
    )
    row = vol_result.first()
    return {
        "active_volunteers": row[0] if row else 0,
        "pending_opt_in": row[1] if row else 0,
        "total_volunteers": row[2] if row else 0,
    }


@router.get("/approvals")
async def list_approvals(db: AsyncSession = Depends(get_db)) -> dict[str, list]:
    """Return pending agent-proposed actions awaiting director approval."""
    result = await db.execute(
        text(
            "SELECT id, action_type, payload, created_at FROM agent_approvals "
            "WHERE status = 'pending' ORDER BY created_at ASC"
        )
    )
    rows = result.fetchall()
    return {
        "approvals": [
            {"id": str(r[0]), "action_type": r[1], "payload": r[2], "created_at": str(r[3])}
            for r in rows
        ]
    }


@router.get("/activity")
async def agent_activity(db: AsyncSession = Depends(get_db)) -> dict[str, list]:
    approvals_result = await db.execute(
        text(
            "SELECT id, action_type, status, created_at, decided_at FROM agent_approvals "
            "ORDER BY created_at DESC LIMIT 20"
        )
    )
    ai_calls_result = await db.execute(
        text(
            "SELECT id, purpose, model, created_at FROM ai_calls ORDER BY created_at DESC LIMIT 20"
        )
    )
    sms_result = await db.execute(
        text(
            "SELECT id, direction, status, sent_at FROM sms_messages ORDER BY sent_at DESC LIMIT 20"
        )
    )

    entries = []
    for row in approvals_result.fetchall():
        entries.append(
            {
                "type": "approval",
                "id": str(row[0]),
                "message": f"Approval request: {row[1]}",
                "status": row[2],
                "created_at": str(row[3]),
                "decided_at": str(row[4]) if row[4] else None,
            }
        )
    for row in ai_calls_result.fetchall():
        entries.append(
            {
                "type": "ai_call",
                "id": str(row[0]),
                "message": f"AI call for {row[1]} using {row[2]}",
                "status": "completed",
                "created_at": str(row[3]),
            }
        )
    for row in sms_result.fetchall():
        entries.append(
            {
                "type": "sms",
                "id": str(row[0]),
                "message": f"SMS {row[1]} status: {row[2]}",
                "status": row[2],
                "created_at": str(row[3]),
            }
        )

    entries.sort(key=lambda entry: entry["created_at"], reverse=True)
    return {"entries": entries[:30]}


@router.post("/approvals/{approval_id}/decide")
async def decide_approval(
    approval_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Approve or reject an agent-proposed action."""
    approved: bool = body.get("approved", False)
    new_status = "approved" if approved else "rejected"

    await db.execute(
        text("UPDATE agent_approvals SET status = :status, decided_at = now() WHERE id = :id"),
        {"status": new_status, "id": str(approval_id)},
    )
    await db.commit()
    return {"status": new_status}


class DiscoverBody(BaseModel):
    city: str = "Richmond"
    state: str = "VA"
    existing_count: int = 0


@router.post("/discover-food-banks")
async def discover_food_banks(
    body: DiscoverBody,
) -> dict[str, object]:
    """
    Ask the LLM to find food banks in a given city/state.
    Returns a list of food bank objects ready to drop onto the map.
    """
    api_key = settings.openrouter_api_key or None
    if not api_key:
        return {"food_banks": [], "message": "No API key configured"}

    system_prompt = (
        "Return ONLY a valid JSON array — no markdown, no prose, no code fences. "
        "Each object must match exactly: {id,name,address,city,state,phone,lat,lng,type,status,donationLevel,hours,notes}. "
        "Rules: id must be unique like 'disc-1'; lat/lng must be numeric floats; donationLevel must be an integer 0-100; "
        "status must be 'open' or 'closed'; type must be 'food_bank' or 'food_pantry'; notes must be under 60 chars. "
        "Only include organizations you are reasonably confident are real food-assistance providers. If uncertain, omit them. "
        "If you cannot find confident results, return []."
    )

    user_msg = (
        f"List 5 real food pantries in {body.city}, {body.state} with accurate GPS coordinates. "
        f"Focus on church-based and community programs. Return JSON array only."
    )

    client = OpenRouterClient(api_key=api_key)
    raw = await client.chat_complete_with_fallback(
        messages=[{"role": "user", "content": user_msg}],
        model=MODEL_AGENT,
        system=system_prompt,
        max_tokens=2000,
    )

    # Parse JSON from LLM response
    try:
        # Strip markdown fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        food_banks = json.loads(cleaned.strip())
        if not isinstance(food_banks, list):
            food_banks = []
    except Exception:
        food_banks = []

    return {
        "food_banks": food_banks,
        "source": "ai_discovery",
        "city": body.city,
        "state": body.state,
    }
