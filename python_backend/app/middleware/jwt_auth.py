from __future__ import annotations

import uuid
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

_PUBLIC_EXACT_PATHS = {
    "/health",
    "/ready",
    "/openapi.json",
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
    "/volunteers/signup",
    "/volunteers/public-signup",
}
_PUBLIC_PREFIXES = ("/auth/", "/webhooks/")


@dataclass(frozen=True)
class AuthContext:
    tenant_id: uuid.UUID
    user_id: str


def is_public_path(path: str) -> bool:
    if path in _PUBLIC_EXACT_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in _PUBLIC_PREFIXES)


def _needs_public_tenant(path: str) -> bool:
    return (
        path in {"/volunteers/signup", "/volunteers/public-signup"}
        or path.startswith("/webhooks/")
    )


def _decode_bearer_token(token: str) -> dict[str, object]:
    secrets = [settings.jwt_secret]
    if settings.node_jwt_secret and settings.node_jwt_secret not in secrets:
        secrets.append(settings.node_jwt_secret)

    last_error: Exception | None = None
    for secret in secrets:
        try:
            return jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
        except jwt.ExpiredSignatureError:
            raise
        except jwt.InvalidTokenError as exc:
            last_error = exc

    raise jwt.InvalidTokenError(str(last_error) if last_error else "Invalid token")


def require_auth_context(request: Request) -> AuthContext:
    tenant_raw = getattr(request.state, "tenant_id", "") or ""
    user_raw = getattr(request.state, "user_id", "") or ""
    if not tenant_raw or not user_raw:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        tenant_id = uuid.UUID(str(tenant_raw))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid tenant context") from exc
    return AuthContext(tenant_id=tenant_id, user_id=str(user_raw))


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """
    Validates Bearer JWTs and populates request.state with tenant_id and user_id.

    Routes starting with /health, /auth/, or /webhooks/ are exempt.
    """

    async def dispatch(self, request: Request, call_next: object) -> Response:
        request.state.tenant_id = ""
        request.state.user_id = ""

        path = request.url.path
        if request.method == "OPTIONS":
            return await call_next(request)  # type: ignore[operator]
        if is_public_path(path):
            if _needs_public_tenant(path):
                request.state.tenant_id = settings.public_tenant_id
                request.state.user_id = "public"
            return await call_next(request)  # type: ignore[operator]

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse({"detail": "Missing authorization header"}, status_code=401)

        token = auth_header.removeprefix("Bearer ")
        try:
            payload = _decode_bearer_token(token)
        except jwt.ExpiredSignatureError:
            return JSONResponse({"detail": "Token expired"}, status_code=401)
        except jwt.InvalidTokenError:
            return JSONResponse({"detail": "Invalid token"}, status_code=401)

        tenant_claim = payload.get("tenant_id", "")
        user_claim = payload.get("sub", "")

        # Legacy Node tokens may only carry userId. Treat that user as its
        # own tenant instead of collapsing all app users into one public roster.
        if not tenant_claim and payload.get("userId"):
            tenant_claim = payload.get("userId")
            user_claim = payload.get("userId")

        if not tenant_claim or not user_claim:
            return JSONResponse({"detail": "Token missing required claims"}, status_code=401)
        try:
            tenant_id = uuid.UUID(str(tenant_claim))
        except (TypeError, ValueError):
            return JSONResponse({"detail": "Invalid tenant claim"}, status_code=401)

        request.state.tenant_id = str(tenant_id)
        request.state.user_id = str(user_claim)
        return await call_next(request)  # type: ignore[operator]
