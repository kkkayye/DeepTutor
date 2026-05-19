from __future__ import annotations

from types import SimpleNamespace

import pytest

from socartes.co_writer import edit_agent


@pytest.mark.asyncio
async def test_edit_agent_offloads_sync_web_search(monkeypatch: pytest.MonkeyPatch) -> None:
    inside_to_thread = False
    to_thread_calls = 0

    async def fake_to_thread(func, *args, **kwargs):
        nonlocal inside_to_thread, to_thread_calls
        to_thread_calls += 1
        inside_to_thread = True
        try:
            return func(*args, **kwargs)
        finally:
            inside_to_thread = False

    def fake_web_search(*_args, **_kwargs):
        assert inside_to_thread
        return {"answer": "context", "citations": [], "search_results": [], "usage": {}}

    async def fake_stream_llm(**_kwargs):
        yield "edited"

    agent = edit_agent.EditAgent.__new__(edit_agent.EditAgent)
    agent.enabled_tools = ["web_search"]
    agent.logger = SimpleNamespace(
        info=lambda *_args, **_kwargs: None,
        warning=lambda *_args, **_kwargs: None,
        error=lambda *_args, **_kwargs: None,
    )
    agent.binding = "openai"
    agent.get_model = lambda: "gpt-test"
    agent.get_prompt = lambda _key, default="": default
    agent._build_available_tools_text = lambda: "web_search"
    agent._get_source_label = lambda source: str(source or "")
    agent.stream_llm = fake_stream_llm

    monkeypatch.setattr(edit_agent, "web_search", fake_web_search)
    monkeypatch.setattr(edit_agent, "save_tool_call", lambda *_args, **_kwargs: "tool.json")
    monkeypatch.setattr(edit_agent, "load_history", lambda: [])
    monkeypatch.setattr(edit_agent, "save_history", lambda _history: None)
    monkeypatch.setattr(
        edit_agent,
        "asyncio",
        SimpleNamespace(to_thread=fake_to_thread),
        raising=False,
    )

    result = await agent.process(
        text="draft",
        instruction="find context",
        action="rewrite",
        source="web",
    )

    assert result["edited_text"] == "edited"
    assert to_thread_calls == 1
