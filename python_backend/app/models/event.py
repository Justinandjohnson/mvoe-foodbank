from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantScopedMixin, TimestampMixin


class Event(Base, TenantScopedMixin, TimestampMixin):
    __tablename__ = "events"
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ck_event_times"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    volunteers_needed: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    location: Mapped[str | None] = mapped_column(Text)
    recurrence_rule: Mapped[str | None] = mapped_column(Text, comment="iCal RRULE string")
    ai_ab_arm_default: Mapped[str] = mapped_column(
        Enum("ai", "generic", name="ab_arm_type"), nullable=False, default="generic"
    )


class Signup(Base, TenantScopedMixin):
    __tablename__ = "signups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    volunteer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("invited", "confirmed", "declined", "noshow", "attended", name="signup_status"),
        nullable=False,
        default="invited",
    )
    ab_arm: Mapped[str] = mapped_column(
        Enum("ai", "generic", name="ab_arm_type"), nullable=False
    )
    check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
