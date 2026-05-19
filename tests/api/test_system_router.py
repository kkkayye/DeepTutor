from __future__ import annotations

from types import SimpleNamespace

import pytest

from socartes.api.routers import system as system_router


@pytest.mark.asyncio
async def test_embeddings_connection_uses_batch_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, list[str]] = {}

    class _FakeClient:
        async def embed(self, texts: list[str]):
            captured["texts"] = texts
            return [[0.1, 0.2], [0.3, 0.4]]

    monkeypatch.setattr(
        system_router,
        "get_embedding_config",
        lambda: SimpleNamespace(model="embed-test", binding="openai"),
    )
    monkeypatch.setattr(system_router, "get_embedding_client", lambda: _FakeClient())

    response = await system_router.test_embeddings_connection()

    assert response.success is True
    assert captured["texts"] == ["test", "retrieval batch probe"]


@pytest.mark.asyncio
async def test_embeddings_connection_rejects_partial_batch_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeClient:
        async def embed(self, texts: list[str]):
            return [[0.1, 0.2]]

    monkeypatch.setattr(
        system_router,
        "get_embedding_config",
        lambda: SimpleNamespace(model="embed-test", binding="openai"),
    )
    monkeypatch.setattr(system_router, "get_embedding_client", lambda: _FakeClient())

    response = await system_router.test_embeddings_connection()

    assert response.success is False
    assert response.message == "Embeddings connection failed: Invalid response"


@pytest.mark.asyncio
async def test_search_connection_offloads_sync_web_search(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inside_to_thread = False

    async def fake_to_thread(func, *args, **kwargs):
        nonlocal inside_to_thread
        inside_to_thread = True
        try:
            return func(*args, **kwargs)
        finally:
            inside_to_thread = False

    def fake_web_search(*_args, **_kwargs):
        assert inside_to_thread
        return {"answer": "ok"}

    monkeypatch.setattr(
        system_router,
        "resolve_search_runtime_config",
        lambda: SimpleNamespace(
            requested_provider="duckduckgo",
            unsupported_provider=False,
            missing_credentials=False,
            provider="duckduckgo",
        ),
    )
    monkeypatch.setattr(system_router, "web_search", fake_web_search)
    monkeypatch.setattr(
        system_router,
        "asyncio",
        SimpleNamespace(to_thread=fake_to_thread),
        raising=False,
    )

    response = await system_router.test_search_connection()

    assert response.success is True
