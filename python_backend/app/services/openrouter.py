from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Default models aligned with the local MiniMax-over-OpenRouter decision
MODEL_AGENT = "minimax/minimax-m2.7"
MODEL_DRAFT = "minimax/minimax-m2.7"
MODEL_FALLBACK = "minimax/minimax-m2.7"


class OpenRouterClient:
    """
    Async httpx wrapper for the OpenRouter API.

    Each pantry tenant provides their own API key. This client is instantiated
    per-request with the decrypted tenant key — keys are never stored in memory
    longer than a single request.
    """

    def __init__(self, api_key: str, base_url: str = settings.openrouter_base_url) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    async def _post_chat_completion(
        self, payload: dict[str, Any], headers: dict[str, str]
    ) -> dict[str, Any]:
        last_error: Exception | None = None

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{self._base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    )

                if response.status_code >= 500 and attempt < 2:
                    logger.warning(
                        "OpenRouter server error %s on attempt %s; retrying",
                        response.status_code,
                        attempt + 1,
                    )
                    await asyncio.sleep(0.25 * (attempt + 1))
                    continue

                if response.status_code == 429:
                    logger.warning("OpenRouter rate limit hit for model %s", payload.get("model"))

                response.raise_for_status()
                return response.json()
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
                if attempt == 2:
                    raise
                logger.warning("OpenRouter transport error on attempt %s: %s", attempt + 1, exc)
                await asyncio.sleep(0.25 * (attempt + 1))

        if last_error:
            raise last_error

        raise RuntimeError("OpenRouter request failed without an error response")

    async def chat_complete(
        self,
        messages: list[dict[str, str]],
        model: str = MODEL_DRAFT,
        system: str = "",
        max_tokens: int = 300,
    ) -> str:
        """
        Send a chat completion request and return the assistant message content.

        Raises httpx.HTTPStatusError on non-2xx responses.
        """
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if system:
            payload["messages"] = [{"role": "system", "content": system}, *messages]

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "HTTP-Referer": "https://mvoe.org",
            "X-Title": "MVOE Pantry Platform",
            "Content-Type": "application/json",
        }

        data = await self._post_chat_completion(payload, headers)
        return str(data["choices"][0]["message"]["content"])

    async def chat_complete_with_fallback(
        self,
        messages: list[dict[str, str]],
        model: str = MODEL_DRAFT,
        system: str = "",
        max_tokens: int = 300,
    ) -> str:
        """
        Attempt the requested model; fall back to MODEL_FALLBACK on rate limit.
        Fallback stays inside OpenRouter — no provider switching.
        """
        try:
            return await self.chat_complete(
                messages, model=model, system=system, max_tokens=max_tokens
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429 and model != MODEL_FALLBACK:
                logger.warning(
                    "Primary model %s rate-limited, falling back to %s", model, MODEL_FALLBACK
                )
                return await self.chat_complete(
                    messages, model=MODEL_FALLBACK, system=system, max_tokens=max_tokens
                )
            raise
