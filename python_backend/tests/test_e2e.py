"""
End-to-end tests against a live server (localhost:8001) and real services.

Setup uses psycopg2 directly (superuser, no RLS) for creating fixture data.
API tests use httpx through the full middleware stack.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import jwt
import psycopg2
import pytest
import pytest_asyncio

from app.config import settings
from app.encryption import encrypt_secret

BASE_URL = "http://localhost:8001"
# Set OPENROUTER_API_KEY in your environment (e.g. .env) — never hardcode it here.
OPENROUTER_KEY = os.environ["OPENROUTER_API_KEY"]

# Superuser connection for fixture setup — bypasses RLS intentionally.
_SUPERUSER_URL = "postgresql://jjohnson@localhost:5432/mvoe_dev"

# App-user connection (non-superuser, subject to RLS) for isolation tests.
_APP_URL = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")


def _sync_conn():
    """Return a raw psycopg2 connection (superuser, bypasses RLS for setup)."""
    return psycopg2.connect(_SUPERUSER_URL)


def _app_conn():
    """Return a psycopg2 connection as the app user (subject to RLS)."""
    return psycopg2.connect(_APP_URL)


# ── Session-scoped fixtures ────────────────────────────────────────────────────

_TEST_PHONE = "+15550000001"


@pytest.fixture(scope="session")
def tenant_id() -> str:
    """
    Upsert a test tenant and its OpenRouter key via psycopg2 (superuser).

    Idempotent across test runs: returns the existing tenant_id if the phone
    already exists, otherwise inserts fresh.  tenant_secrets uses a plain
    INSERT guarded by a SELECT because ON CONFLICT is banned on tables with
    UPDATE rules.
    """
    ciphertext = encrypt_secret(OPENROUTER_KEY)

    conn = _sync_conn()
    conn.autocommit = True
    cur = conn.cursor()

    # Upsert the tenant row; tenants has no UPDATE rule so ON CONFLICT is fine.
    cur.execute(
        "INSERT INTO tenants (id, name, phone_e164, plan) "
        "VALUES (gen_random_uuid(), %s, %s, 'free') "
        "ON CONFLICT (phone_e164) DO UPDATE SET name = EXCLUDED.name "
        "RETURNING id",
        ("Test Hope Pantry", _TEST_PHONE),
    )
    tid = str(cur.fetchone()[0])

    # Only insert the secret if it doesn't exist yet (UPDATE rule blocks ON CONFLICT).
    cur.execute(
        "SELECT 1 FROM tenant_secrets WHERE tenant_id = %s AND key_name = 'openrouter_api_key'",
        (tid,),
    )
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO tenant_secrets (tenant_id, key_name, ciphertext, key_version) "
            "VALUES (%s, 'openrouter_api_key', %s, 1)",
            (tid, bytes(ciphertext)),
        )

    cur.close()
    conn.close()
    return tid


@pytest.fixture(scope="session")
def auth_token(tenant_id: str) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(hours=24)
    payload = {
        "sub": "+15550000001",
        "tenant_id": tenant_id,
        "exp": expire,
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@pytest.fixture(scope="session")
def headers(auth_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth_token}"}


# Phones created by write tests — must be pre-cleaned so tests are idempotent.
_TRANSIENT_PHONES = ("+15551112222", "+15553334444")


@pytest.fixture(scope="session", autouse=True)
def clean_test_volunteers() -> None:
    """Delete transient volunteer rows before the session so write tests start clean."""
    conn = _sync_conn()
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("SET session_replication_role = 'replica'")
        cur.execute(
            "DELETE FROM volunteers WHERE phone_e164 IN %s",
            (_TRANSIENT_PHONES,),
        )
        cur.execute("SET session_replication_role = 'origin'")
    conn.close()


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health():
    async with httpx.AsyncClient(base_url=BASE_URL) as c:
        r = await c.get("/health")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_unauthenticated_rejected():
    async with httpx.AsyncClient(base_url=BASE_URL) as c:
        r = await c.get("/volunteers")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_rejected():
    async with httpx.AsyncClient(
        base_url=BASE_URL, headers={"Authorization": "Bearer garbage"}
    ) as c:
        r = await c.get("/volunteers")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_volunteers_list_empty(headers):
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        r = await c.get("/volunteers")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "volunteers" in data
    assert isinstance(data["total"], int)


@pytest.mark.asyncio
async def test_create_volunteer(headers) -> str:
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        r = await c.post(
            "/volunteers",
            json={
                "phone_e164": "+15551112222",
                "name": "Carlos Rodriguez",
                "tags": ["saturday", "warehouse"],
            },
        )
    assert r.status_code == 201, r.text
    vol = r.json()
    assert vol["name"] == "Carlos Rodriguez"
    assert vol["opt_in_state"] == "pending"
    assert vol["trust_score"] == 50
    return vol["id"]


@pytest.mark.asyncio
async def test_duplicate_volunteer_rejected(headers):
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        # First insert
        r1 = await c.post("/volunteers", json={"phone_e164": "+15553334444", "name": "Dupe A"})
        assert r1.status_code == 201, r1.text
        # Second insert with same phone — must conflict
        r2 = await c.post("/volunteers", json={"phone_e164": "+15553334444", "name": "Dupe B"})
    assert r2.status_code == 409, r2.text


@pytest.mark.asyncio
async def test_create_event(headers) -> str:
    starts = (datetime.now(tz=timezone.utc) + timedelta(days=3)).isoformat()
    ends = (datetime.now(tz=timezone.utc) + timedelta(days=3, hours=4)).isoformat()
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        r = await c.post(
            "/events",
            json={
                "title": "Saturday Food Distribution",
                "starts_at": starts,
                "ends_at": ends,
                "volunteers_needed": 12,
                "location": "123 Main St",
            },
        )
    assert r.status_code == 201, r.text
    event = r.json()
    assert event["title"] == "Saturday Food Distribution"
    assert event["volunteers_needed"] == 12
    return event["id"]


@pytest.mark.asyncio
async def test_event_ends_before_starts_rejected(headers):
    starts = (datetime.now(tz=timezone.utc) + timedelta(days=3)).isoformat()
    ends = (datetime.now(tz=timezone.utc) + timedelta(days=2)).isoformat()
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        r = await c.post(
            "/events",
            json={
                "title": "Bad Event",
                "starts_at": starts,
                "ends_at": ends,
                "volunteers_needed": 5,
            },
        )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_event_roster_returns_structure(headers):
    starts = (datetime.now(tz=timezone.utc) + timedelta(days=5)).isoformat()
    ends = (datetime.now(tz=timezone.utc) + timedelta(days=5, hours=4)).isoformat()
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        create_r = await c.post(
            "/events",
            json={
                "title": "Roster Test Event",
                "starts_at": starts,
                "ends_at": ends,
                "volunteers_needed": 3,
            },
        )
        assert create_r.status_code == 201
        event_id = create_r.json()["id"]
        roster_r = await c.get(f"/events/{event_id}/roster")
    assert roster_r.status_code == 200, roster_r.text
    roster = roster_r.json()
    assert roster["event_id"] == event_id
    assert roster["confirmed"] == 0
    assert isinstance(roster["signups"], list)


@pytest.mark.asyncio
async def test_reminder_draft_empty_event(headers):
    """An event with no signups returns an empty draft list — not an error."""
    starts = (datetime.now(tz=timezone.utc) + timedelta(days=3)).isoformat()
    ends = (datetime.now(tz=timezone.utc) + timedelta(days=3, hours=4)).isoformat()
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        create_r = await c.post(
            "/events",
            json={
                "title": "Empty Reminder Test",
                "starts_at": starts,
                "ends_at": ends,
                "volunteers_needed": 5,
            },
        )
        event_id = create_r.json()["id"]
        r = await c.post(f"/events/{event_id}/reminders/draft")
    assert r.status_code == 200, r.text
    assert r.json() == []


@pytest.mark.asyncio
async def test_volunteer_summary_endpoint(headers):
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        r = await c.get("/agent/volunteer-summary")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "active_volunteers" in data
    assert "total_volunteers" in data


@pytest.mark.asyncio
async def test_approvals_list_empty(headers):
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        r = await c.get("/agent/approvals")
    assert r.status_code == 200, r.text
    assert "approvals" in r.json()


@pytest.mark.asyncio
async def test_agent_activity_endpoint(headers):
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as c:
        r = await c.get("/agent/activity")
    assert r.status_code == 200, r.text
    assert "entries" in r.json()


@pytest.mark.asyncio
async def test_agent_chat_real_openrouter(headers):
    """Sends a real message through the live backend → OpenRouter → Claude. No mocks."""
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=60.0) as c:
        r = await c.post(
            "/agent/chat", json={"message": "How many volunteers do I currently have on my roster?"}
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "reply" in data
    assert len(data["reply"]) > 10, f"Expected real reply, got: {data['reply']!r}"


def test_tenant_rls_isolation_sync():
    """
    Verify that tenant A cannot see tenant B's data via RLS.

    Uses superuser for fixture setup (bypasses RLS) then reconnects as the
    non-superuser app role to verify that SET LOCAL + RLS properly isolates rows.
    """
    su_conn = _sync_conn()  # superuser — used only for setup
    tid_a = str(uuid.uuid4())
    tid_b = str(uuid.uuid4())
    # Deterministic 10-digit phone tails from UUID hex digits
    phone_a = f"+1555{tid_a.replace('-', '')[:7]}"
    phone_b = f"+1666{tid_b.replace('-', '')[:7]}"

    # Unique per run — avoids phone conflicts across test runs
    vol_phone = f"+1555{tid_a.replace('-', '')[:10]}"

    try:
        # ── Setup (superuser, RLS bypassed) ───────────────────────────────────
        su_conn.autocommit = True
        with su_conn.cursor() as cur:
            cur.execute(
                "INSERT INTO tenants (id, name, phone_e164) VALUES (%s, %s, %s)",
                (tid_a, "RLS Pantry A", phone_a),
            )
            cur.execute(
                "INSERT INTO tenants (id, name, phone_e164) VALUES (%s, %s, %s)",
                (tid_b, "RLS Pantry B", phone_b),
            )
            # Insert volunteer for tenant A with a UUID-derived phone (unique per run)
            cur.execute(
                "INSERT INTO volunteers (id, tenant_id, phone_e164, name) "
                "VALUES (gen_random_uuid(), %s, %s, 'RLS Test Volunteer')",
                (tid_a, vol_phone),
            )
        su_conn.close()

        # ── Verification (app role, subject to RLS) ───────────────────────────
        app_conn = _app_conn()
        try:
            with app_conn.cursor() as cur:
                # Tenant B's view — should see nothing
                cur.execute(f"SET LOCAL app.tenant_id = '{tid_b}'")
                cur.execute("SELECT COUNT(*) FROM volunteers WHERE name = 'RLS Test Volunteer'")
                count_b = cur.fetchone()[0]
                assert count_b == 0, f"RLS FAILED: tenant B saw {count_b} of tenant A's volunteers"

                # Tenant A's view — should see the volunteer
                cur.execute(f"SET LOCAL app.tenant_id = '{tid_a}'")
                cur.execute("SELECT COUNT(*) FROM volunteers WHERE name = 'RLS Test Volunteer'")
                count_a = cur.fetchone()[0]
                assert count_a == 1, f"Tenant A should see its own volunteer, got {count_a}"

            app_conn.rollback()
        finally:
            app_conn.close()

    finally:
        # Cleanup via superuser.
        # SET session_replication_role='replica' disables FK trigger checks so we
        # can delete volunteers even though sms_messages has a DO INSTEAD NOTHING
        # UPDATE rule that would otherwise confuse the SET NULL FK cascade.
        cleanup = _sync_conn()
        cleanup.autocommit = True
        with cleanup.cursor() as cur:
            # Disable FK trigger checks so DO INSTEAD NOTHING rules on sms_messages /
            # tenant_secrets don't confuse the referential integrity cascade.
            cur.execute("SET session_replication_role = 'replica'")
            cur.execute("DELETE FROM volunteers WHERE phone_e164 = %s", (vol_phone,))
            cur.execute("DELETE FROM tenants WHERE id = %s OR id = %s", (tid_a, tid_b))
            cur.execute("SET session_replication_role = 'origin'")
        cleanup.close()
