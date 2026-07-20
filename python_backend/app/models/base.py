from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TenantScopedMixin:
    """Mixin that adds tenant_id to every multi-tenant table."""

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
        comment="RLS enforced: must match current_setting('app.tenant_id')",
    )


class TimestampMixin:
    """Mixin that adds created_at / updated_at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


__all__ = ["Base", "TenantScopedMixin", "TimestampMixin"]
