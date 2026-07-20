from __future__ import annotations

import uuid

from pydantic import Field
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = Field(..., description="asyncpg-compatible Postgres URL")
    fernet_key: str = Field(..., description="Fernet key for encrypting tenant secrets")
    jwt_secret: str = Field(..., description="HS256 signing key (32+ chars)")
    node_jwt_secret: str = Field("", description="Optional Node API JWT secret for Expo app account tokens")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours

    twilio_account_sid: str = Field(..., description="MVOE platform Twilio account SID")
    twilio_auth_token: str = Field(..., description="MVOE platform Twilio auth token")
    twilio_phone_number: str = Field(..., description="E.164 sender number e.g. +15551234567")
    twilio_verify_service_sid: str = Field("", description="Twilio Verify Service SID for OTP")

    openrouter_api_key: str = ""  # platform-level fallback key for unauthenticated/demo use
    migration_database_url: str = ""  # optional superuser URL for Alembic
    sentry_dsn: str = ""
    environment: str = "development"
    redis_url: str = Field(
        "",
        description="Redis URL for shared rate limiting across backend instances",
    )
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    frontend_url: str = ""
    public_tenant_id: str = "f663aa3a-fdc7-4653-841d-a5a8418a3543"

    @field_validator("public_tenant_id")
    @classmethod
    def validate_public_tenant_id(cls, value: str) -> str:
        try:
            return str(uuid.UUID(str(value)))
        except (TypeError, ValueError) as exc:
            raise ValueError("PUBLIC_TENANT_ID must be a valid UUID") from exc


settings = Settings()  # type: ignore[call-arg]


def _is_local_url(value: str) -> bool:
    return "localhost" in value or "127.0.0.1" in value


def production_readiness() -> dict[str, object]:
    checks = [
        {
            "key": "environment",
            "ok": settings.environment == "production",
            "message": "ENVIRONMENT must be production for public deployment.",
        },
        {
            "key": "database_url",
            "ok": not _is_local_url(settings.database_url),
            "message": "DATABASE_URL must point to managed production Postgres.",
        },
        {
            "key": "redis_url",
            "ok": bool(settings.redis_url) and not _is_local_url(settings.redis_url),
            "message": "REDIS_URL must point to managed production Redis.",
        },
        {
            "key": "jwt_secret",
            "ok": bool(settings.jwt_secret) and settings.jwt_secret != "change-me-32-chars-minimum-required",
            "message": "JWT_SECRET must be unique and not the development default.",
        },
        {
            "key": "node_jwt_secret",
            "ok": bool(settings.node_jwt_secret),
            "message": "NODE_JWT_SECRET must match the Node API JWT_SECRET.",
        },
        {
            "key": "twilio",
            "ok": all([
                settings.twilio_account_sid,
                settings.twilio_auth_token,
                settings.twilio_phone_number,
            ]),
            "message": "Twilio credentials are required for volunteer SMS at scale.",
        },
        {
            "key": "frontend_url",
            "ok": bool(settings.frontend_url) and not _is_local_url(settings.frontend_url),
            "message": "FRONTEND_URL must be the public app URL.",
        },
    ]
    failed = [check for check in checks if not check["ok"]]
    return {
        "ready": len(failed) == 0,
        "checks": checks,
        "failed": failed,
    }


if settings.environment == "production":
    readiness = production_readiness()
    if not readiness["ready"]:
        raise RuntimeError(f"Unsafe production configuration: {readiness['failed']}")
