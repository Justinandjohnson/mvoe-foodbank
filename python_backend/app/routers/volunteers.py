from __future__ import annotations

import html
import base64
import hashlib
import hmac
import re
import socket
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.sms import SmsMessage
from app.models.tenant import Tenant
from app.models.volunteer import Volunteer
from app.schemas.volunteer import (
    VolunteerCreate,
    VolunteerListResponse,
    VolunteerOut,
    VolunteerTagAssignRequest,
    VolunteerTagAssignResponse,
    VolunteerTagBroadcastRequest,
    VolunteerTagCount,
    VolunteerTagListResponse,
    VolunteerUpdate,
)
from app.services.twilio_sms import twilio_service

router = APIRouter(prefix="/volunteers", tags=["volunteers"])

# Demo tenant UUID used when no JWT is present (dev / unauthenticated flow)
_DEMO_TENANT_ID = uuid.UUID(settings.public_tenant_id)
_PANTRY_NAME = "Hope Pantry"


class SmsBody(BaseModel):
    message: str


class VolunteerPublicSignup(BaseModel):
    name: str
    phone: str
    email: str | None = None
    tenant_token: str | None = None
    tags: list[str] = Field(default_factory=list)
    groups: list[str] = Field(default_factory=list)
    signup_source: str | None = None
    referral_tag: str | None = None
    sms_consent: bool = True


class GroupAssignBody(BaseModel):
    volunteer_ids: list[uuid.UUID] = Field(default_factory=list)
    group_name: str
    mode: Literal["add", "remove", "replace"] = "add"


class GroupBroadcastBody(BaseModel):
    message: str
    groups: list[str] = Field(default_factory=list)
    match_mode: Literal["any", "all"] = "any"

    @property
    def normalized_message(self) -> str:
        return (self.message or "").strip()


async def _get_pantry_name(db: AsyncSession, tenant_id: uuid.UUID | None = None) -> str:
    resolved_tenant_id = tenant_id or _DEMO_TENANT_ID
    tenant_name_result = await db.execute(
        text("SELECT name FROM tenants WHERE id = :tenant_id LIMIT 1"),
        {"tenant_id": str(resolved_tenant_id)},
    )
    tenant_name = tenant_name_result.scalar_one_or_none()
    return tenant_name or _PANTRY_NAME


def _normalize_public_phone(raw_value: str) -> str:
    raw = (raw_value or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="Phone number is required")

    if raw.startswith("+"):
        digits = "".join(ch for ch in raw if ch.isdigit())
        if digits:
            return f"+{digits}"

    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"

    raise HTTPException(status_code=422, detail="Enter a valid US phone number")


def _normalize_tag(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\s\-_]", "", (value or "").strip()).lower()
    cleaned = re.sub(r"\s+", "-", cleaned).strip("-_")
    return cleaned[:40]


def _normalize_tags(values: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        tag = _normalize_tag(value)
        if not tag or tag in seen:
            continue
        normalized.append(tag)
        seen.add(tag)
    return normalized


def _normalize_email(value: str | None) -> str | None:
    trimmed = (value or "").strip().lower()
    return trimmed or None


def _trim_or_none(value: str | None) -> str | None:
    trimmed = (value or "").strip()
    return trimmed or None


def _effective_tenant_uuid(request: Request | None = None) -> uuid.UUID:
    if request is not None:
        raw_tid = getattr(request.state, "tenant_id", "") or ""
        if raw_tid:
            try:
                return uuid.UUID(str(raw_tid))
            except (TypeError, ValueError):
                pass
    return _DEMO_TENANT_ID


def _decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


def _encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _tenant_signup_signature(tenant_id: uuid.UUID) -> str:
    digest = hmac.new(
        settings.jwt_secret.encode("utf-8"),
        str(tenant_id).encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _encode_base64url(digest)


def _tenant_signup_token(tenant_id: uuid.UUID) -> str:
    return f"{tenant_id}.{_tenant_signup_signature(tenant_id)}"


def _tenant_from_signup_token(token: str | None) -> uuid.UUID:
    raw_token = (token or "").strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Volunteer signup link is missing a tenant token")

    try:
        tenant_part, signature_part = raw_token.split(".", 1)
        tenant_id = uuid.UUID(tenant_part)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="Volunteer signup link is invalid") from exc

    expected_signature = _tenant_signup_signature(tenant_id)
    if not hmac.compare_digest(signature_part, expected_signature):
        raise HTTPException(status_code=401, detail="Volunteer signup link is invalid")
    return tenant_id


def _synthetic_tenant_phone(tenant_id: uuid.UUID) -> str:
    # Tenant rows require a unique phone-like value; app-account tenants may not
    # have an org phone yet, so derive a deterministic internal placeholder.
    suffix = str(int(tenant_id.hex[:12], 16)).zfill(10)[-10:]
    return f"+1{suffix}"


async def _set_tenant_scope(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    await db.execute(text(f"SET app.tenant_id = '{tenant_id}'"))


async def _ensure_tenant(db: AsyncSession, tenant_id: uuid.UUID, request: Request | None = None) -> None:
    existing = await db.execute(select(Tenant.id).where(Tenant.id == tenant_id))
    if existing.scalar_one_or_none():
        return

    user_hint = getattr(getattr(request, "state", None), "user_id", "") if request is not None else ""
    name = f"MVOE workspace {str(tenant_id)[:8]}"
    if user_hint and user_hint != "public":
        name = f"MVOE user {str(user_hint)[:8]}"

    db.add(
        Tenant(
            id=tenant_id,
            name=name,
            phone_e164=_synthetic_tenant_phone(tenant_id),
            timezone="America/Chicago",
            metro="Austin",
        )
    )
    await db.flush()


def _build_signup_source(request: Request, source_hint: str | None = None) -> str:
    source = _normalize_tag(source_hint or "qr_signup") or "qr_signup"
    user_agent = request.headers.get("user-agent", "")
    channel = "web"
    if "android" in user_agent.lower() or "iphone" in user_agent.lower() or "ipad" in user_agent.lower():
        channel = "mobile"
    return f"{source}:{channel}"[:100]


def _local_ip_address() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        try:
            sock.close()
        except Exception:
            pass


def _signup_share_url(request: Request, tenant_token: str) -> str:
    host = request.url.hostname or "127.0.0.1"
    if host in {"127.0.0.1", "localhost", "0.0.0.0"}:
        host = _local_ip_address()

    port = request.url.port or 8001
    return f"{request.url.scheme}://{host}:{port}/volunteers/signup?t={tenant_token}"


def _signup_page_html(request: Request, pantry_name: str, tenant_token: str) -> str:
    share_url = html.escape(_signup_share_url(request, tenant_token), quote=True)
    pantry_label = html.escape(pantry_name)
    token_value = html.escape(tenant_token, quote=True)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Volunteer with {pantry_label}</title>
    <style>
      :root {{
        color-scheme: dark;
        --bg-1: #07121f;
        --bg-2: #0d2f3c;
        --glass: rgba(15, 23, 42, 0.72);
        --glass-soft: rgba(255, 255, 255, 0.12);
        --border: rgba(255, 255, 255, 0.18);
        --text: #f8fafc;
        --muted: rgba(248, 250, 252, 0.72);
        --accent: #86efac;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(52, 211, 153, 0.18), transparent 32%),
          radial-gradient(circle at top right, rgba(96, 165, 250, 0.16), transparent 28%),
          linear-gradient(160deg, var(--bg-1), var(--bg-2) 58%, #dcefe6 150%);
        display: grid;
        place-items: center;
        padding: 20px;
      }}
      .shell {{
        width: min(560px, 100%);
        border-radius: 32px;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.84), rgba(15, 23, 42, 0.62));
        border: 1px solid var(--border);
        box-shadow: 0 24px 80px rgba(2, 6, 23, 0.35);
        backdrop-filter: blur(18px);
        overflow: hidden;
      }}
      .hero {{
        padding: 28px 26px 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }}
      .eyebrow {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 12px;
      }}
      .hero h1 {{
        margin: 0 0 8px;
        font-size: clamp(30px, 5vw, 38px);
        line-height: 1.05;
      }}
      .hero p {{
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }}
      .body {{
        padding: 20px 22px 24px;
        display: grid;
        gap: 16px;
      }}
      .pill-row {{
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }}
      .pill {{
        border-radius: 999px;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-size: 13px;
        color: rgba(248, 250, 252, 0.82);
      }}
      form {{
        display: grid;
        gap: 14px;
      }}
      label {{
        display: grid;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        color: rgba(248, 250, 252, 0.88);
      }}
      input {{
        width: 100%;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.08);
        color: var(--text);
        font-size: 15px;
        outline: none;
      }}
      input::placeholder {{
        color: rgba(248, 250, 252, 0.42);
      }}
      .tag-grid {{
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }}
      .tag-option {{
        position: relative;
      }}
      .tag-option input {{
        position: absolute;
        inset: 0;
        opacity: 0;
      }}
      .tag-option span {{
        display: inline-flex;
        align-items: center;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: rgba(248, 250, 252, 0.82);
        font-size: 13px;
        font-weight: 700;
      }}
      .tag-option input:checked + span {{
        background: rgba(134, 239, 172, 0.18);
        border-color: rgba(134, 239, 172, 0.48);
        color: #dcfce7;
      }}
      .consent {{
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }}
      .consent input {{
        width: 18px;
        height: 18px;
        margin-top: 2px;
      }}
      button {{
        border: 0;
        border-radius: 20px;
        padding: 15px 18px;
        background: linear-gradient(135deg, #d1fae5, #86efac);
        color: #052e16;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
      }}
      .status {{
        display: none;
        border-radius: 18px;
        padding: 14px 16px;
        font-size: 14px;
        line-height: 1.5;
      }}
      .status.success {{
        display: block;
        background: rgba(16, 185, 129, 0.16);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: #dcfce7;
      }}
      .status.error {{
        display: block;
        background: rgba(239, 68, 68, 0.16);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #fee2e2;
      }}
      .share {{
        font-size: 12px;
        color: rgba(248, 250, 252, 0.56);
        word-break: break-word;
      }}
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="hero">
        <div class="eyebrow">Volunteer intake</div>
        <h1>Join the {pantry_label} response team.</h1>
        <p>Share your contact details once and MVOE will drop you into the live volunteer roster for pantry runs, public meals, and emergency food response.</p>
      </div>

      <div class="body">
        <div class="pill-row">
          <span class="pill">Fast signup</span>
          <span class="pill">SMS updates optional</span>
          <span class="pill">Stored in the live volunteer system</span>
        </div>

        <form id="signup-form">
          <input type="hidden" name="tenantToken" value="{token_value}" />

          <label>
            Full name
            <input type="text" name="name" placeholder="Ada Johnson" required />
          </label>

          <label>
            Mobile phone
            <input type="tel" name="phone" placeholder="(512) 555-0123" required />
          </label>

          <label>
            Email
            <input type="email" name="email" placeholder="ada@example.com" />
          </label>

          <div>
            <label style="margin-bottom: 8px;">Where can you help?</label>
            <div class="tag-grid">
              <label class="tag-option"><input type="checkbox" name="tags" value="new-volunteer" checked /><span>New volunteer</span></label>
              <label class="tag-option"><input type="checkbox" name="tags" value="pantry-team" /><span>Pantry team</span></label>
              <label class="tag-option"><input type="checkbox" name="tags" value="meal-response" /><span>Meal response</span></label>
              <label class="tag-option"><input type="checkbox" name="tags" value="on-call" /><span>On call</span></label>
            </div>
          </div>

          <label class="consent">
            <input type="checkbox" name="smsConsent" checked />
            <span>I agree to receive volunteer coordination texts from {pantry_label} and understand message and data rates may apply.</span>
          </label>

          <button type="submit">Join the volunteer roster</button>
        </form>

        <div id="status" class="status"></div>
        <div class="share">{share_url}</div>
      </div>
    </div>

    <script>
      const form = document.getElementById('signup-form');
      const statusNode = document.getElementById('status');

      form.addEventListener('submit', async (event) => {{
        event.preventDefault();

        const formData = new FormData(form);
        const tags = formData.getAll('tags');
        const payload = {{
          name: String(formData.get('name') || '').trim(),
          phone: String(formData.get('phone') || '').trim(),
          email: String(formData.get('email') || '').trim() || null,
          tenant_token: String(formData.get('tenantToken') || '').trim(),
          tags,
          sms_consent: formData.get('smsConsent') === 'on',
        }};

        statusNode.className = 'status';
        statusNode.textContent = '';

        try {{
          const response = await fetch('/volunteers/public-signup', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json' }},
            body: JSON.stringify(payload),
          }});

          const data = await response.json();
          if (!response.ok) {{
            throw new Error(data.detail || data.error || 'Signup failed');
          }}

          statusNode.className = 'status success';
          statusNode.textContent = 'You are in. Your details were added to the live volunteer roster.';
          form.reset();
          const defaultTag = form.querySelector('input[value="new-volunteer"]');
          const consent = form.querySelector('input[name="smsConsent"]');
          if (defaultTag) defaultTag.checked = true;
          if (consent) consent.checked = true;
        }} catch (error) {{
          statusNode.className = 'status error';
          statusNode.textContent = error.message || 'Signup failed';
        }}
      }});
    </script>
  </body>
</html>"""


@router.get("/signup-share")
async def signup_share(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    tenant_id = _effective_tenant_uuid(request)
    await _ensure_tenant(db, tenant_id, request)
    await db.commit()
    tenant_token = _tenant_signup_token(tenant_id)
    return {"share_url": _signup_share_url(request, tenant_token)}


@router.get("/signup", response_class=HTMLResponse)
async def volunteer_signup_page(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    tenant_token = (request.query_params.get("t") or "").strip()
    tenant_id = _tenant_from_signup_token(tenant_token)
    await _set_tenant_scope(db, tenant_id)
    await _ensure_tenant(db, tenant_id, request)
    await db.commit()
    pantry_name = await _get_pantry_name(db, tenant_id)
    return HTMLResponse(_signup_page_html(request, pantry_name, tenant_token))


@router.post("/public-signup", response_model=VolunteerOut, status_code=200)
async def public_signup_volunteer(
    body: VolunteerPublicSignup,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> VolunteerOut:
    tenant_id = _tenant_from_signup_token(body.tenant_token)
    await _set_tenant_scope(db, tenant_id)
    await _ensure_tenant(db, tenant_id, request)
    phone_e164 = _normalize_public_phone(body.phone)
    email = _normalize_email(body.email)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")

    if email:
        existing_result = await db.execute(
            select(Volunteer).where(
                Volunteer.tenant_id == tenant_id,
                or_(Volunteer.phone_e164 == phone_e164, Volunteer.email == email),
            )
        )
    else:
        existing_result = await db.execute(
            select(Volunteer).where(Volunteer.tenant_id == tenant_id, Volunteer.phone_e164 == phone_e164)
        )
    matches = existing_result.scalars().all()
    phone_match = next((vol for vol in matches if vol.phone_e164 == phone_e164), None)
    email_match = next((vol for vol in matches if email and vol.email == email), None)

    if phone_match and email_match and phone_match.id != email_match.id:
        raise HTTPException(
            status_code=409,
            detail="That phone and email belong to different volunteers. Contact support to merge records.",
        )

    existing = phone_match or email_match

    tags = _normalize_tags(
        [
            *(body.tags or []),
            *(body.groups or []),
            *(["group:" + group for group in (body.groups or [])]),
            *(["ref:" + body.referral_tag] if body.referral_tag else []),
            "new-volunteer",
        ]
    )
    consented = bool(body.sms_consent)
    signup_source = _build_signup_source(request, body.signup_source)

    if existing:
        existing.name = name
        if email:
            existing.email = email
        if existing.phone_e164 != phone_e164:
            existing.phone_e164 = phone_e164
        existing.tags = _normalize_tags([*(existing.tags or []), *tags])
        existing.opt_in_source = signup_source
        if consented:
            existing.opt_in_state = "active"
            existing.opt_in_at = existing.opt_in_at or datetime.now(timezone.utc)
        await db.commit()
        return VolunteerOut.model_validate(existing)

    volunteer = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        phone_e164=phone_e164,
        name=name,
        email=email,
        tags=tags,
        opt_in_state="active" if consented else "pending",
        opt_in_source=signup_source,
        opt_in_at=datetime.now(timezone.utc) if consented else None,
    )
    db.add(volunteer)
    await db.commit()
    return VolunteerOut.model_validate(volunteer)


@router.get("", response_model=VolunteerListResponse)
async def list_volunteers(
    db: AsyncSession = Depends(get_db),
    offset: int = 0,
    limit: int = 100,
    tag: str | None = None,
) -> VolunteerListResponse:
    """List all volunteers for the authenticated tenant (RLS enforces isolation)."""
    base_query = select(Volunteer)
    normalized_tag = _normalize_tag(tag or "")
    if normalized_tag:
        base_query = base_query.where(Volunteer.tags.overlap([normalized_tag]))

    query = base_query.order_by(Volunteer.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    volunteers = result.scalars().all()
    total_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = int(total_result.scalar_one() or 0)
    return VolunteerListResponse(
        volunteers=[VolunteerOut.model_validate(v) for v in volunteers],
        total=total,
    )


@router.get("/tags", response_model=VolunteerTagListResponse)
async def list_volunteer_tags(
    db: AsyncSession = Depends(get_db),
) -> VolunteerTagListResponse:
    result = await db.execute(
        text(
            "SELECT tag, COUNT(*)::int AS count "
            "FROM (SELECT unnest(tags) AS tag FROM volunteers) t "
            "GROUP BY tag ORDER BY count DESC, tag ASC"
        )
    )
    rows = result.fetchall()
    tags = [VolunteerTagCount(tag=row[0], count=row[1]) for row in rows if row[0]]
    return VolunteerTagListResponse(tags=tags, total_tags=len(tags))


@router.post("/tags/assign", response_model=VolunteerTagAssignResponse)
async def assign_volunteer_tags(
    body: VolunteerTagAssignRequest,
    db: AsyncSession = Depends(get_db),
) -> VolunteerTagAssignResponse:
    volunteer_ids = list(dict.fromkeys(body.volunteer_ids))
    if not volunteer_ids:
        raise HTTPException(status_code=422, detail="volunteer_ids is required")

    tags = _normalize_tags(body.tags)
    if body.mode in {"add", "replace"} and not tags:
        raise HTTPException(status_code=422, detail="At least one tag is required")

    result = await db.execute(select(Volunteer).where(Volunteer.id.in_(volunteer_ids)))
    volunteers = result.scalars().all()
    if not volunteers:
        raise HTTPException(status_code=404, detail="No matching volunteers found")

    updated_volunteers: list[VolunteerOut] = []
    for volunteer in volunteers:
        current_tags = _normalize_tags(volunteer.tags or [])
        if body.mode == "add":
            volunteer.tags = _normalize_tags([*current_tags, *tags])
        elif body.mode == "remove":
            to_remove = set(tags)
            volunteer.tags = [tag for tag in current_tags if tag not in to_remove]
        else:
            volunteer.tags = tags
        updated_volunteers.append(VolunteerOut.model_validate(volunteer))

    await db.commit()
    return VolunteerTagAssignResponse(updated=len(updated_volunteers), volunteers=updated_volunteers)


@router.post("/groups/assign", response_model=VolunteerTagAssignResponse)
async def assign_volunteer_group(
    body: GroupAssignBody,
    db: AsyncSession = Depends(get_db),
) -> VolunteerTagAssignResponse:
    normalized_group = _normalize_tag(body.group_name)
    if not normalized_group:
        raise HTTPException(status_code=422, detail="group_name is required")

    payload = VolunteerTagAssignRequest(
        volunteer_ids=body.volunteer_ids,
        tags=[f"group:{normalized_group}"],
        mode=body.mode,
    )
    return await assign_volunteer_tags(payload, db)


@router.get("/groups")
async def list_volunteer_groups(
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    result = await db.execute(
        text(
            "SELECT tag, COUNT(*)::int AS count "
            "FROM (SELECT unnest(tags) AS tag FROM volunteers) t "
            "WHERE tag LIKE 'group:%' "
            "GROUP BY tag ORDER BY count DESC, tag ASC"
        )
    )
    rows = result.fetchall()
    groups = [
        {"group": str(row[0]).removeprefix("group:"), "count": int(row[1])}
        for row in rows
        if row[0]
    ]
    return {"groups": groups, "total_groups": len(groups)}


@router.post("", response_model=VolunteerOut, status_code=201)
async def create_volunteer(
    body: VolunteerCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> VolunteerOut:
    """Add a volunteer to the tenant's roster."""
    tenant_id = _effective_tenant_uuid(request)
    await _ensure_tenant(db, tenant_id, request)

    # Prevent duplicates within the same tenant (enforced by DB unique constraint too)
    existing = await db.execute(
        select(Volunteer).where(Volunteer.tenant_id == tenant_id, Volunteer.phone_e164 == body.phone_e164)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Volunteer with phone {body.phone_e164} already exists",
        )
    if body.email:
        existing_email = await db.execute(
            select(Volunteer).where(Volunteer.tenant_id == tenant_id, Volunteer.email == body.email)
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Volunteer with email {body.email} already exists",
            )

    volunteer = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        phone_e164=body.phone_e164,
        name=body.name.strip(),
        email=_trim_or_none(body.email),
        tags=_normalize_tags(body.tags),
    )
    db.add(volunteer)
    await db.commit()
    # expire_on_commit=False + RETURNING in INSERT means the object is fully
    # populated after commit — no refresh() needed, avoiding a cross-transaction SELECT.
    return VolunteerOut.model_validate(volunteer)


@router.patch("/{volunteer_id}", response_model=VolunteerOut)
async def update_volunteer(
    volunteer_id: uuid.UUID,
    body: VolunteerUpdate,
    db: AsyncSession = Depends(get_db),
) -> VolunteerOut:
    """Update an existing volunteer's profile."""
    result = await db.execute(select(Volunteer).where(Volunteer.id == volunteer_id))
    volunteer = result.scalar_one_or_none()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    target_phone = body.phone_e164 or volunteer.phone_e164
    if target_phone != volunteer.phone_e164:
        existing_phone = await db.execute(
            select(Volunteer).where(
                Volunteer.phone_e164 == target_phone,
                Volunteer.id != volunteer.id,
            )
        )
        if existing_phone.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Another volunteer already has that phone number")

    target_email = body.email if body.email is not None else volunteer.email
    if target_email:
        existing_email = await db.execute(
            select(Volunteer).where(
                Volunteer.email == target_email,
                Volunteer.id != volunteer.id,
            )
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Another volunteer already has that email")

    if body.phone_e164:
        volunteer.phone_e164 = body.phone_e164
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Name cannot be empty")
        volunteer.name = name
    if body.email is not None:
        volunteer.email = _trim_or_none(body.email)
    if body.tags is not None:
        volunteer.tags = _normalize_tags(body.tags)
    if body.opt_in_state is not None:
        volunteer.opt_in_state = body.opt_in_state
    await db.commit()
    return VolunteerOut.model_validate(volunteer)


@router.delete("/{volunteer_id}", status_code=204)
async def delete_volunteer(
    volunteer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a volunteer from the roster."""
    result = await db.execute(select(Volunteer).where(Volunteer.id == volunteer_id))
    volunteer = result.scalar_one_or_none()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    await db.delete(volunteer)
    await db.commit()


def _send_volunteer_sms(
    volunteer: Volunteer,
    message: str,
    pantry_name: str,
    db: AsyncSession,
) -> dict[str, str]:
    result = twilio_service.send_sms(
        to=volunteer.phone_e164,
        body=message,
        pantry_name=pantry_name,
    )
    db.add(
        SmsMessage(
            id=uuid.uuid4(),
            tenant_id=volunteer.tenant_id,
            volunteer_id=volunteer.id,
            direction="out",
            twilio_sid=result["twilio_sid"],
            body=message,
            status=result["status"],
        )
    )
    return result


@router.post("/{volunteer_id}/sms", status_code=200)
async def send_sms_to_volunteer(
    volunteer_id: uuid.UUID,
    body: SmsBody,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Send an SMS message to a single volunteer."""
    result = await db.execute(select(Volunteer).where(Volunteer.id == volunteer_id))
    volunteer = result.scalar_one_or_none()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    if volunteer.opt_in_state == "stopped":
        raise HTTPException(status_code=422, detail="Volunteer has opted out of SMS")

    pantry_name = await _get_pantry_name(db, volunteer.tenant_id)
    result = _send_volunteer_sms(volunteer, body.message, pantry_name, db)
    await db.commit()
    return {"status": result["status"], "sid": result["twilio_sid"]}


@router.post("/broadcast", status_code=200)
async def broadcast_sms(
    body: SmsBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Send an SMS to all active (opted-in) volunteers."""
    result = await db.execute(select(Volunteer).where(Volunteer.opt_in_state == "active"))
    active = result.scalars().all()

    if not active:
        return {"sent": 0, "message": "No active volunteers to message"}

    pantry_name = await _get_pantry_name(db, _effective_tenant_uuid(request))
    sent, failed = 0, 0
    for v in active:
        try:
            _send_volunteer_sms(v, body.message, pantry_name, db)
            sent += 1
        except Exception:
            failed += 1

    await db.commit()
    return {"sent": sent, "failed": failed, "total": len(active)}


@router.post("/broadcast/by-tag", status_code=200)
async def broadcast_sms_by_tag(
    body: VolunteerTagBroadcastRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    tags = _normalize_tags(body.tags)
    if not tags:
        raise HTTPException(status_code=422, detail="At least one tag is required")

    query = select(Volunteer).where(Volunteer.opt_in_state == "active")
    if body.match_mode == "all":
        query = query.where(Volunteer.tags.contains(tags))
    else:
        query = query.where(Volunteer.tags.overlap(tags))

    result = await db.execute(query)
    recipients = result.scalars().all()
    if not recipients:
        return {
            "sent": 0,
            "failed": 0,
            "total": 0,
            "tags": tags,
            "match_mode": body.match_mode,
            "message": "No active volunteers matched the selected tags",
        }

    pantry_name = await _get_pantry_name(db, _effective_tenant_uuid(request))
    sent, failed = 0, 0
    for volunteer in recipients:
        try:
            _send_volunteer_sms(volunteer, body.message, pantry_name, db)
            sent += 1
        except Exception:
            failed += 1

    await db.commit()
    return {
        "sent": sent,
        "failed": failed,
        "total": len(recipients),
        "tags": tags,
        "match_mode": body.match_mode,
    }


@router.post("/broadcast/by-group", status_code=200)
async def broadcast_sms_by_group(
    body: GroupBroadcastBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    message = body.normalized_message
    if not message:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    normalized_groups = _normalize_tags(body.groups)
    if not normalized_groups:
        raise HTTPException(status_code=422, detail="At least one group is required")

    tag_payload = VolunteerTagBroadcastRequest(
        message=message,
        tags=[f"group:{group}" for group in normalized_groups],
        match_mode=body.match_mode,
    )
    result = await broadcast_sms_by_tag(tag_payload, request, db)
    return {
        **result,
        "groups": normalized_groups,
    }
