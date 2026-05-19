from __future__ import annotations

import pytest

from socartes.book.engine import BookEngine
from socartes.book.models import Block, BlockStatus, BlockType, Page, PageStatus
from socartes.book.storage import BookStorage


def test_force_compile_reset_preserves_user_notes() -> None:
    generated = Block(
        type=BlockType.CODE,
        status=BlockStatus.READY,
        payload={"code": "print(1)"},
        source_anchors=[],
        metadata={"generation_ms": 10, "transition_in": "bridge"},
    )
    note = Block(
        type=BlockType.USER_NOTE,
        status=BlockStatus.READY,
        payload={"body": "keep me"},
    )
    page = Page(status=PageStatus.READY, error="", blocks=[generated, note])

    BookEngine._reset_page_for_force_compile(page)

    assert page.status == PageStatus.PENDING
    assert generated.status == BlockStatus.PENDING
    assert generated.payload == {}
    assert generated.error == ""
    assert generated.metadata == {"transition_in": "bridge"}
    assert note.status == BlockStatus.READY
    assert note.payload == {"body": "keep me"}


@pytest.mark.asyncio
async def test_book_storage_async_page_wrappers_delegate_to_sync_methods(monkeypatch) -> None:
    storage = BookStorage()
    page = Page(book_id="book-1", id="page-1", status=PageStatus.READY)
    calls: list[tuple[str, str]] = []

    def _load_page(book_id: str, page_id: str) -> Page:
        calls.append((book_id, page_id))
        return page

    monkeypatch.setattr(storage, "load_page", _load_page)

    result = await storage.load_page_async("book-1", "page-1")

    assert result is page
    assert calls == [("book-1", "page-1")]
