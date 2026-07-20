from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a tenant-scoped async session.

    Sets `app.tenant_id` as a Postgres session variable so that Row-Level Security
    policies enforce tenant isolation.  We use SET (session-scoped) rather than
    SET LOCAL (transaction-scoped) because a single request may call db.commit()
    multiple times; SET LOCAL would be lost after the first commit.  The RESET in
    the finally block prevents the setting from leaking to the next request that
    borrows the same pooled connection.
    """
    tenant_id: str = getattr(request.state, "tenant_id", "")
    # Fall back to the demo/dev tenant so unauthenticated routes satisfy RLS
    effective_tenant_id = tenant_id or "f663aa3a-fdc7-4653-841d-a5a8418a3543"
    async with AsyncSessionLocal() as session:
        # SET does not accept bind parameters — tenant_id comes from a validated JWT
        # or is the hardcoded demo UUID; neither is user-controlled input.
        await session.execute(
            __import__("sqlalchemy").text(f"SET app.tenant_id = '{effective_tenant_id}'")
        )
        try:
            yield session
        finally:
            await session.execute(
                __import__("sqlalchemy").text("RESET app.tenant_id")
            )
