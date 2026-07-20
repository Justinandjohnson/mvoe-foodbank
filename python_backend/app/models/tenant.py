from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_e164: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(
        Enum("free", "paid", "state", name="plan_type"), nullable=False, default="free"
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Chicago")
    metro: Mapped[str | None] = mapped_column(String(100))
    validation_gate_passed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
