from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, Enum, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantScopedMixin, TimestampMixin


class Volunteer(Base, TenantScopedMixin, TimestampMixin):
    __tablename__ = "volunteers"
    __table_args__ = (UniqueConstraint("tenant_id", "phone_e164"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    phone_e164: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    opt_in_state: Mapped[str] = mapped_column(
        Enum("pending", "active", "stopped", name="opt_in_state"),
        nullable=False,
        default="pending",
    )
    opt_in_source: Mapped[str | None] = mapped_column(String(100))
    opt_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_shift_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_shift_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trust_score: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=50)
