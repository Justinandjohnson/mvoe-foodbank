"""Initial schema with multi-tenant RLS

Revision ID: 001
Revises:
Create Date: 2026-04-17
"""
from __future__ import annotations

from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE plan_type     AS ENUM ('free', 'paid', 'state');
CREATE TYPE user_role     AS ENUM ('admin', 'coord');
CREATE TYPE opt_in_state  AS ENUM ('pending', 'active', 'stopped');
CREATE TYPE sms_direction AS ENUM ('out', 'in');
CREATE TYPE signup_status AS ENUM ('invited', 'confirmed', 'declined', 'noshow', 'attended');
CREATE TYPE ab_arm_type   AS ENUM ('ai', 'generic');
CREATE TYPE opt_in_action AS ENUM ('optin', 'optout', 'help');
CREATE TYPE ai_purpose    AS ENUM ('reminder_draft', 'risk_score', 'summary');

-- ── 1. tenants ────────────────────────────────────────────────────────────────
CREATE TABLE tenants (
    id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                      TEXT        NOT NULL,
    phone_e164                TEXT        NOT NULL UNIQUE,
    plan                      plan_type   NOT NULL DEFAULT 'free',
    timezone                  TEXT        NOT NULL DEFAULT 'America/Chicago',
    metro                     TEXT,
    validation_gate_passed_at TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS on tenants — auth middleware guards this table directly.

-- ── 2. tenant_secrets (immutable rotation log) ────────────────────────────────
CREATE TABLE tenant_secrets (
    tenant_id    UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_name     TEXT  NOT NULL CHECK (key_name IN ('openrouter_api_key','google_oauth_refresh_token')),
    ciphertext   BYTEA NOT NULL,
    key_version  INT   NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, key_name, key_version)
);

CREATE RULE tenant_secrets_no_update AS ON UPDATE TO tenant_secrets DO INSTEAD NOTHING;
CREATE RULE tenant_secrets_no_delete AS ON DELETE TO tenant_secrets DO INSTEAD NOTHING;

-- ── 3. users ──────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_e164    TEXT      NOT NULL,
    name          TEXT      NOT NULL,
    role          user_role NOT NULL DEFAULT 'coord',
    last_login_at TIMESTAMPTZ,
    UNIQUE (tenant_id, phone_e164)
);

-- ── 4. volunteers ─────────────────────────────────────────────────────────────
CREATE TABLE volunteers (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_e164     TEXT          NOT NULL,
    name           TEXT          NOT NULL,
    email          TEXT,
    tags           TEXT[]        NOT NULL DEFAULT '{}',
    opt_in_state   opt_in_state  NOT NULL DEFAULT 'pending',
    opt_in_source  TEXT,
    opt_in_at      TIMESTAMPTZ,
    first_shift_at TIMESTAMPTZ,
    last_shift_at  TIMESTAMPTZ,
    trust_score    SMALLINT      NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, phone_e164)
);

-- ── 5. events ─────────────────────────────────────────────────────────────────
CREATE TABLE events (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title             TEXT         NOT NULL,
    starts_at         TIMESTAMPTZ  NOT NULL,
    ends_at           TIMESTAMPTZ  NOT NULL,
    volunteers_needed SMALLINT     NOT NULL DEFAULT 0,
    location          TEXT,
    recurrence_rule   TEXT,
    ai_ab_arm_default ab_arm_type  NOT NULL DEFAULT 'generic',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_event_times CHECK (ends_at > starts_at)
);

-- ── 6. signups ────────────────────────────────────────────────────────────────
CREATE TABLE signups (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_id     UUID          NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
    volunteer_id UUID          NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    status       signup_status NOT NULL DEFAULT 'invited',
    ab_arm       ab_arm_type   NOT NULL DEFAULT 'generic',
    check_in_at  TIMESTAMPTZ
);

-- ── 7. sms_messages (TCPA audit — IMMUTABLE) ──────────────────────────────────
CREATE TABLE sms_messages (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
    volunteer_id UUID          REFERENCES volunteers(id)            ON DELETE SET NULL,
    direction    sms_direction NOT NULL,
    twilio_sid   TEXT          NOT NULL UNIQUE,
    body         TEXT          NOT NULL,
    status       TEXT          NOT NULL,
    cost_cents   SMALLINT,
    sent_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    template_key TEXT,
    ai_model     TEXT,
    ai_tokens    INT
);

CREATE RULE sms_no_update AS ON UPDATE TO sms_messages DO INSTEAD NOTHING;
CREATE RULE sms_no_delete AS ON DELETE TO sms_messages DO INSTEAD NOTHING;

-- ── 8. opt_in_log (TCPA legal evidence — IMMUTABLE) ───────────────────────────
CREATE TABLE opt_in_log (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_e164         TEXT         NOT NULL,
    action             opt_in_action NOT NULL,
    source_ip          INET,
    consent_text_shown TEXT,
    raw_request        JSONB,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE RULE opt_in_no_update AS ON UPDATE TO opt_in_log DO INSTEAD NOTHING;
CREATE RULE opt_in_no_delete AS ON DELETE TO opt_in_log DO INSTEAD NOTHING;

-- ── 9. ai_calls ───────────────────────────────────────────────────────────────
CREATE TABLE ai_calls (
    id                UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID       NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model             TEXT       NOT NULL,
    prompt_tokens     INT        NOT NULL,
    completion_tokens INT        NOT NULL,
    cost_cents        INT        NOT NULL DEFAULT 0,
    purpose           ai_purpose NOT NULL,
    ref_id            UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 10. conversation_state (inbound SMS routing) ──────────────────────────────
CREATE TABLE conversation_state (
    phone_e164 TEXT        NOT NULL,
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    state      TEXT        NOT NULL DEFAULT 'idle',
    context    JSONB       NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (phone_e164, tenant_id)
);

-- ── 11. agent_approvals (agent-proposed actions awaiting director tap) ─────────
CREATE TABLE agent_approvals (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action_type TEXT        NOT NULL,
    payload     JSONB       NOT NULL DEFAULT '{}',
    status      TEXT        NOT NULL DEFAULT 'pending',
    decided_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Enable and force RLS on all tenant-scoped tables.
-- The policy reads current_setting with missing_ok=true so that migrations
-- and admin connections (which don't set the variable) fail closed.

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenant_secrets','users','volunteers','events','signups',
    'sms_messages','opt_in_log','ai_calls','conversation_state','agent_approvals'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Event roster — primary hot path for distribution-day screen
CREATE INDEX idx_signups_event        ON signups (tenant_id, event_id, status);
CREATE UNIQUE INDEX idx_signups_dedup ON signups (event_id, volunteer_id);

-- Volunteer attendance history for trust_score calculation
CREATE INDEX idx_signups_volunteer    ON signups (tenant_id, volunteer_id, status);

-- Inbound SMS routing
CREATE INDEX idx_conv_state_lookup    ON conversation_state (tenant_id, phone_e164);

-- Opt-in gate: checked before every outbound SMS
CREATE INDEX idx_vol_optin_phone      ON volunteers (tenant_id, phone_e164, opt_in_state);

-- AI cost reporting by tenant and period
CREATE INDEX idx_ai_calls_tenant_time ON ai_calls (tenant_id, created_at DESC);

-- Volunteer name fuzzy search
CREATE INDEX idx_vol_name_trgm        ON volunteers USING gin (name gin_trgm_ops);

-- Pending approval polling
CREATE INDEX idx_approvals_pending    ON agent_approvals (tenant_id, status, created_at)
  WHERE status = 'pending';
""")


def downgrade() -> None:
    op.execute("""
DROP TABLE IF EXISTS agent_approvals CASCADE;
DROP TABLE IF EXISTS conversation_state CASCADE;
DROP TABLE IF EXISTS ai_calls CASCADE;
DROP TABLE IF EXISTS opt_in_log CASCADE;
DROP TABLE IF EXISTS sms_messages CASCADE;
DROP TABLE IF EXISTS signups CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS volunteers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenant_secrets CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DROP TYPE IF EXISTS ai_purpose;
DROP TYPE IF EXISTS opt_in_action;
DROP TYPE IF EXISTS ab_arm_type;
DROP TYPE IF EXISTS signup_status;
DROP TYPE IF EXISTS sms_direction;
DROP TYPE IF EXISTS opt_in_state;
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS plan_type;
""")
