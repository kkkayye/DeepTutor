from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from socartes.tutorbot.agent.tools import web as web_tools


class _FakeHTTPResponse:
    status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {
            "data": [
                {
                    "title": "Title",
                    "url": "https://example.test",
                    "content": "Snippet",
                }
            ]
        }


@pytest.mark.asyncio
async def test_web_search_tool_reuses_httpx_client(monkeypatch: pytest.MonkeyPatch) -> None:
    created: list[object] = []

    class _FakeAsyncClient:
        def __init__(self, **_kwargs: Any) -> None:
            created.append(self)

        async def __aenter__(self) -> "_FakeAsyncClient":
            return self

        async def __aexit__(self, *_args: Any) -> None:
            return None

        async def get(self, *_args: Any, **_kwargs: Any) -> _FakeHTTPResponse:
            return _FakeHTTPResponse()

    monkeypatch.setattr(web_tools.httpx, "AsyncClient", _FakeAsyncClient)

    tool = web_tools.WebSearchTool(
        config=SimpleNamespace(
            provider="jina",
            api_key="sk-test",
            base_url="",
            max_results=3,
        )
    )

    assert "Title" in await tool._search_jina("query one", 3)
    assert "Title" in await tool._search_jina("query two", 3)
    assert len(created) == 1
