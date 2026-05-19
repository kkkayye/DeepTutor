"""Tests for the page-agent OpenAI-compatible router."""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient


page_agent = importlib.import_module("socartes.api.routers.page_agent")


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(page_agent.router, prefix="/api/v1/page-agent")
    return app


def test_page_agent_forwards_openai_compatible_completion(monkeypatch) -> None:
    captured: dict[str, Any] = {}
    upstream_payload = {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1,
        "model": "default-model",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_123",
                            "type": "function",
                            "function": {
                                "name": "AgentOutput",
                                "arguments": '{"type":"done","message":"Done"}',
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
    }

    class FakeResponse:
        def model_dump(self, **kwargs):
            captured["model_dump_kwargs"] = kwargs
            return upstream_payload

    class FakeCompletions:
        async def create(self, **kwargs):
            captured.update(kwargs)
            return FakeResponse()

    class FakeClient:
        def __init__(self):
            self.chat = type("Chat", (), {"completions": FakeCompletions()})()

        async def close(self):
            captured["closed"] = True

    monkeypatch.setattr(
        page_agent,
        "get_llm_config",
        lambda: SimpleNamespace(
            model="default-model",
            api_key="sk-test",
            base_url="https://example.test/v1",
            effective_url="https://example.test/v1",
            binding="openai",
            provider_name="openai",
            api_version=None,
            extra_headers=None,
        ),
    )
    monkeypatch.setattr(page_agent, "_build_openai_client", lambda config: FakeClient())

    response = TestClient(_build_app()).post(
        "/api/v1/page-agent/openai/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": "look at page"}],
            "tools": [{"type": "function", "function": {"name": "AgentOutput"}}],
            "tool_choice": {"type": "function", "function": {"name": "AgentOutput"}},
            "temperature": 0.7,
        },
    )

    assert response.status_code == 200
    assert response.json() == upstream_payload
    assert captured["model"] == "default-model"
    assert captured["tools"][0]["function"]["name"] == "AgentOutput"
    assert captured["tool_choice"]["function"]["name"] == "AgentOutput"
    assert captured["closed"] is True


def test_page_agent_returns_graceful_fallback_for_unsupported_provider(monkeypatch) -> None:
    monkeypatch.setattr(
        page_agent,
        "get_llm_config",
        lambda: SimpleNamespace(
            model="claude-test",
            api_key="sk-test",
            base_url="https://example.test/v1",
            effective_url="https://example.test/v1",
            binding="anthropic",
            provider_name="anthropic",
            api_version=None,
            extra_headers=None,
        ),
    )

    response = TestClient(_build_app()).post(
        "/api/v1/page-agent/openai/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "look at page"}]},
    )

    assert response.status_code == 200
    tool_call = response.json()["choices"][0]["message"]["tool_calls"][0]
    assert tool_call["function"]["name"] == "AgentOutput"
    assert '"type": "done"' in tool_call["function"]["arguments"]
