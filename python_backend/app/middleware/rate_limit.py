from __future__ import annotations

import asyncio
import logging
import math
import ssl
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote, urlparse

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = logging.getLogger(__name__)

# Preserve the existing public behavior: 60 requests per tenant/IP per minute.
_LIMIT = 60
_WINDOW = 60

_REDIS_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)

if count >= limit then
    local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
    local retry_after = 1
    if oldest[2] ~= nil then
        retry_after = math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
    end
    return {0, count, retry_after}
end

redis.call("ZADD", key, now, ARGV[4])
redis.call("PEXPIRE", key, window)
return {1, count + 1, 0}
"""


class RedisRateLimitError(RuntimeError):
    """Raised when the configured Redis limiter cannot be reached."""


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    count: int
    retry_after: int = 0


class LocalSlidingWindowLimiter:
    """Single-process development limiter used only when REDIS_URL is unset."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> RateLimitDecision:
        now = time.monotonic()
        window_start = now - self.window_seconds

        async with self._lock:
            bucket = [t for t in self._buckets[key] if t > window_start]
            self._buckets[key] = bucket

            if len(bucket) >= self.limit:
                retry_after = max(1, math.ceil(bucket[0] + self.window_seconds - now))
                return RateLimitDecision(False, len(bucket), retry_after)

            bucket.append(now)
            return RateLimitDecision(True, len(bucket))


class RedisSlidingWindowLimiter:
    """Redis-backed sliding-window limiter safe for multiple backend instances."""

    def __init__(self, url: str, limit: int, window_seconds: int) -> None:
        parsed = urlparse(url)
        if parsed.scheme not in {"redis", "rediss"}:
            raise ValueError("REDIS_URL must use redis:// or rediss://")
        if not parsed.hostname:
            raise ValueError("REDIS_URL must include a host")

        self.host = parsed.hostname
        self.port = parsed.port or 6379
        self.password = unquote(parsed.password) if parsed.password else None
        self.username = unquote(parsed.username) if parsed.username else None
        self.db = int(parsed.path.lstrip("/") or "0")
        self.use_tls = parsed.scheme == "rediss"
        self.limit = limit
        self.window_ms = window_seconds * 1000
        self._writer: asyncio.StreamWriter | None = None
        self._reader: asyncio.StreamReader | None = None
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> RateLimitDecision:
        member = f"{time.time_ns()}"
        now_ms = int(time.time() * 1000)
        redis_key = f"mvoe:rate_limit:{key}"

        try:
            raw = await self._execute(
                "EVAL",
                _REDIS_LUA,
                "1",
                redis_key,
                str(now_ms),
                str(self.window_ms),
                str(self.limit),
                member,
            )
        except Exception as exc:
            await self._disconnect()
            raise RedisRateLimitError("Redis rate limiter is unavailable") from exc

        if not isinstance(raw, list) or len(raw) != 3:
            raise RedisRateLimitError("Redis rate limiter returned an invalid response")

        return RateLimitDecision(
            allowed=bool(raw[0]),
            count=int(raw[1]),
            retry_after=int(raw[2]),
        )

    async def _execute(self, *parts: str) -> Any:
        async with self._lock:
            await self._connect()
            assert self._reader is not None
            assert self._writer is not None

            self._writer.write(_encode_command(parts))
            await self._writer.drain()
            return await _read_resp(self._reader)

    async def _connect(self) -> None:
        if self._reader is not None and self._writer is not None and not self._writer.is_closing():
            return

        tls_context = ssl.create_default_context() if self.use_tls else None
        self._reader, self._writer = await asyncio.open_connection(
            self.host,
            self.port,
            ssl=tls_context,
        )

        if self.password:
            auth_parts = (
                ("AUTH", self.username, self.password) if self.username else ("AUTH", self.password)
            )
            self._writer.write(_encode_command(auth_parts))
            await self._writer.drain()
            await _read_resp(self._reader)

        if self.db:
            self._writer.write(_encode_command(("SELECT", str(self.db))))
            await self._writer.drain()
            await _read_resp(self._reader)

    async def _disconnect(self) -> None:
        async with self._lock:
            if self._writer is None:
                return

            self._writer.close()
            try:
                await self._writer.wait_closed()
            finally:
                self._reader = None
                self._writer = None


def _encode_command(parts: tuple[str | None, ...]) -> bytes:
    values = [part or "" for part in parts]
    encoded = [f"*{len(values)}\r\n".encode()]
    for value in values:
        data = value.encode()
        encoded.append(f"${len(data)}\r\n".encode())
        encoded.append(data)
        encoded.append(b"\r\n")
    return b"".join(encoded)


async def _read_resp(reader: asyncio.StreamReader) -> Any:
    prefix = await reader.readexactly(1)

    if prefix == b"+":
        return (await reader.readline()).rstrip(b"\r\n").decode()
    if prefix == b"-":
        message = (await reader.readline()).rstrip(b"\r\n").decode()
        raise RedisRateLimitError(message)
    if prefix == b":":
        return int((await reader.readline()).rstrip(b"\r\n"))
    if prefix == b"$":
        length = int((await reader.readline()).rstrip(b"\r\n"))
        if length == -1:
            return None
        data = await reader.readexactly(length)
        await reader.readexactly(2)
        return data.decode()
    if prefix == b"*":
        count = int((await reader.readline()).rstrip(b"\r\n"))
        if count == -1:
            return None
        return [await _read_resp(reader) for _ in range(count)]

    raise RedisRateLimitError(f"Unsupported Redis response prefix: {prefix!r}")


_limiter: LocalSlidingWindowLimiter | RedisSlidingWindowLimiter
if settings.redis_url:
    _limiter = RedisSlidingWindowLimiter(settings.redis_url, _LIMIT, _WINDOW)
else:
    logger.warning("REDIS_URL is unset; using single-process in-memory rate limiting")
    _limiter = LocalSlidingWindowLimiter(_LIMIT, _WINDOW)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Per-tenant sliding-window rate limiter (60 req/min).
    Uses Redis when REDIS_URL is configured so multiple instances share quota.
    Falls back to in-memory enforcement only when REDIS_URL is absent.
    """

    async def dispatch(self, request: Request, call_next: object) -> Response:
        key = _request_key(request)

        try:
            decision = await _limiter.check(key)
        except RedisRateLimitError:
            logger.exception("Rate limiter failed closed")
            return JSONResponse({"detail": "Rate limiter unavailable"}, status_code=503)

        if not decision.allowed:
            return JSONResponse(
                {"detail": "Rate limit exceeded"},
                status_code=429,
                headers={"Retry-After": str(decision.retry_after)},
            )

        return await call_next(request)  # type: ignore[operator]


def _request_key(request: Request) -> str:
    tenant_id = getattr(request.state, "tenant_id", None)
    if tenant_id:
        return f"tenant:{tenant_id}"
    if request.client and request.client.host:
        return f"ip:{request.client.host}"
    return "ip:unknown"


async def close_rate_limiter() -> None:
    if isinstance(_limiter, RedisSlidingWindowLimiter):
        await _limiter._disconnect()
