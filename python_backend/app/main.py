from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.config import production_readiness, settings
from app.db import engine
from app.middleware.jwt_auth import JWTAuthMiddleware
from app.middleware.rate_limit import RateLimitMiddleware, close_rate_limiter
from app.routers import agent_chat, auth, events, tenants, volunteers, webhooks

logger = logging.getLogger(__name__)


def build_allowed_origins(environment: str, frontend_url: str) -> list[str]:
    dev_origins = [
        "http://localhost:19006",  # Expo web
        "http://localhost:3000",  # Create React App / Next
        "http://localhost:8081",  # Expo Metro
        "http://localhost:19000",  # Expo DevTools
        "http://localhost:4173",  # Local static export
        "http://127.0.0.1:4173",  # Local static export via loopback
    ]

    if environment == "development":
        return dev_origins

    if frontend_url:
        return [frontend_url]

    return []


# Initialize Sentry before anything else
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("MVOE backend starting up (environment=%s)", settings.environment)
    yield
    logger.info("MVOE backend shutting down")
    await close_rate_limiter()
    await engine.dispose()


app = FastAPI(
    title="MVOE Pantry Platform",
    version="0.1.0",
    description="Agent-powered volunteer coordination for food pantries",
    lifespan=lifespan,
    # Disable docs in production
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

# Middleware stack (outermost → innermost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=build_allowed_origins(settings.environment, settings.frontend_url),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Rate limiter (before auth so it catches unauthenticated floods too)
app.add_middleware(RateLimitMiddleware)

# 3. JWT auth + tenant_id population
app.add_middleware(JWTAuthMiddleware)

# Routers
app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(volunteers.router)
app.include_router(events.router)
app.include_router(webhooks.router)
app.include_router(agent_chat.router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    """Liveness check used by Render and load balancers."""
    return {"status": "ok", "environment": settings.environment}


@app.get("/ready", tags=["ops"])
async def ready(response: Response) -> dict[str, object]:
    """Readiness check for public deployments and load balancers."""
    checks = {
        "database": False,
        "redis": bool(settings.redis_url),
        "configuration": True if settings.environment != "production" else production_readiness()["ready"],
    }

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        checks["database"] = False

    status = "ready" if all(checks.values()) else "not_ready"
    if status != "ready":
        response.status_code = 503
    payload = {
        "status": status,
        "environment": settings.environment,
        "checks": checks,
        "productionReadiness": production_readiness(),
    }
    return payload
