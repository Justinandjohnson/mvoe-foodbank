from __future__ import annotations

import httpx
import pytest

from app.services.openrouter import OpenRouterClient


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload
        self.request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "boom",
                request=self.request,
                response=httpx.Response(self.status_code, request=self.request),
            )


@pytest.mark.asyncio
async def test_openrouter_retries_transport_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = {"count": 0}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, *args, **kwargs):
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise httpx.ConnectError("network down")
            return _FakeResponse(200, {"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    client = OpenRouterClient(api_key="test-key")
    content = await client.chat_complete(messages=[{"role": "user", "content": "hello"}])

    assert content == "ok"
    assert attempts["count"] == 3


@pytest.mark.asyncio
async def test_openrouter_falls_back_on_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    seen_models: list[str] = []

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict, headers: dict):
            seen_models.append(json["model"])
            if len(seen_models) == 1:
                return _FakeResponse(429, {})
            return _FakeResponse(200, {"choices": [{"message": {"content": "fallback ok"}}]})

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    client = OpenRouterClient(api_key="test-key")
    content = await client.chat_complete_with_fallback(
        messages=[{"role": "user", "content": "hello"}],
        model="minimax/minimax-m2.7",
    )

    assert content == "fallback ok"
    assert seen_models == [
        "minimax/minimax-m2.7",
        "minimax/minimax-m2.7",
    ]
