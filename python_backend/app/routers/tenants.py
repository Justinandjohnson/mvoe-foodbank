from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.encryption import encrypt_secret

router = APIRouter(prefix="/tenants", tags=["tenants"])


class TenantOnboardRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    timezone: str = Field(default="America/Chicago", min_length=2, max_length=64)
    metro: str | None = Field(default=None, max_length=100)
    openrouter_api_key: str = Field(min_length=20, max_length=512)


def next_key_version(existing_version: int | None) -> int:
    return (existing_version or 0) + 1


@router.post("/onboard")
async def onboard_tenant(
    body: TenantOnboardRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
    tenant_id = getattr(request.state, "tenant_id", "") or ""
    user_id = getattr(request.state, "user_id", "") or ""

    if not tenant_id or not user_id:
        raise HTTPException(status_code=401, detail="Authenticated onboarding required")

    try:
        tenant_uuid = uuid.UUID(str(tenant_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid tenant context") from exc

    existing_version_result = await db.execute(
        text(
            "SELECT MAX(key_version) "
            "FROM tenant_secrets "
            "WHERE tenant_id = :tenant_id AND key_name = 'openrouter_api_key'"
        ),
        {"tenant_id": str(tenant_uuid)},
    )
    current_version = existing_version_result.scalar_one_or_none()
    new_version = next_key_version(current_version)

    await db.execute(
        text(
            "INSERT INTO tenants (id, name, phone_e164, timezone, metro, validation_gate_passed_at) "
            "VALUES (:id, :name, :phone, :timezone, :metro, now()) "
            "ON CONFLICT (id) DO UPDATE SET "
            "  name = EXCLUDED.name, "
            "  phone_e164 = EXCLUDED.phone_e164, "
            "  timezone = EXCLUDED.timezone, "
            "  metro = EXCLUDED.metro, "
            "  validation_gate_passed_at = now()"
        ),
        {
            "id": str(tenant_uuid),
            "name": body.name,
            "phone": user_id,
            "timezone": body.timezone,
            "metro": body.metro,
        },
    )

    await db.execute(
        text(
            "INSERT INTO tenant_secrets (tenant_id, key_name, ciphertext, key_version) "
            "VALUES (:tenant_id, 'openrouter_api_key', :ciphertext, :key_version)"
        ),
        {
            "tenant_id": str(tenant_uuid),
            "ciphertext": encrypt_secret(body.openrouter_api_key),
            "key_version": new_version,
        },
    )

    await db.commit()

    return {
        "tenant_id": str(tenant_uuid),
        "message": "Tenant onboarding completed",
        "key_version": new_version,
    }
