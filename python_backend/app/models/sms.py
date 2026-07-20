from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantScopedMixin


class SmsMessage(Base, TenantScopedMixin):
    """
    Immutable TCPA audit record.
    The database has RULE-based guards (no UPDATE/DELETE) enforced in the migration.
    Do not add update methods to this model.
    """

    __tablename__ = "sms_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    volunteer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    direction: Mapped[str] = mapped_column(
        Enum("out", "in", name="sms_direction"), nullable=False
    )
    twilio_sid: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    cost_cents: Mapped[int | None] = mapped_column(SmallInteger)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    template_key: Mapped[str | None] = mapped_column(String(100))
    ai_model: Mapped[str | None] = mapped_column(String(100))
    ai_tokens: Mapped[int | None] = mapped_column(Integer)


class OptInLog(Base, TenantScopedMixin):
    """
    Immutable TCPA legal evidence.
    Stores the exact consent text shown and raw request for dispute resolution.
    """

    __tablename__ = "opt_in_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    phone_e164: Mapped[str] = mapped_column(String(20), nullable=False)
    action: Mapped[str] = mapped_column(
        Enum("optin", "optout", "help", name="opt_in_action"), nullable=False
    )
    source_ip: Mapped[str | None] = mapped_column(INET)
    consent_text_shown: Mapped[str | None] = mapped_column(Text)
    raw_request: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AiCall(Base, TenantScopedMixin):
    """Cost accounting and audit trail for every LLM call."""

    __tablename__ = "ai_calls"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    purpose: Mapped[str] = mapped_column(
        Enum("reminder_draft", "risk_score", "summary", name="ai_purpose"), nullable=False
    )
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ConversationState(Base, TenantScopedMixin):
    """
    Tracks inbound SMS reply state per (phone, tenant) pair.
    UPSERT target — updated on every inbound message.
    """

    __tablename__ = "conversation_state"

    phone_e164: Mapped[str] = mapped_column(String(20), primary_key=True)
    # tenant_id is the second part of the composite PK (declared in TenantScopedMixin)
    state: Mapped[str] = mapped_column(String(64), nullable=False, default="idle")
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
