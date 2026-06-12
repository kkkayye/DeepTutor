from __future__ import annotations

import pytest

from socartes.book.engine import BookEngine
from socartes.book import kb_health
from socartes.book.models import (
    Block,
    BlockStatus,
    BlockType,
    Book,
    Chapter,
    ContentType,
    Page,
    PageStatus,
    Spine,
)
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


@pytest.mark.asyncio
async def test_force_compile_removes_compiled_page_from_stale_pages(monkeypatch) -> None:
    class FakeStorage:
        def __init__(self) -> None:
            self.book = Book(
                id="book-1",
                knowledge_bases=["kb-1"],
                kb_fingerprints={"kb-1": "old"},
                stale_page_ids=["page-1", "page-2"],
            )
            self.page = Page(
                id="page-1",
                book_id="book-1",
                chapter_id="chapter-1",
                content_type=ContentType.THEORY,
                status=PageStatus.READY,
            )
            self.spine = Spine(
                book_id="book-1",
                chapters=[Chapter(id="chapter-1", page_ids=["page-1"])],
            )
            self.saved_books: list[Book] = []

        async def load_book_async(self, _book_id: str) -> Book:
            return self.book

        async def load_spine_async(self, _book_id: str) -> Spine:
            return self.spine

        async def load_page_async(self, _book_id: str, _page_id: str) -> Page:
            return self.page

        async def save_page_async(self, page: Page) -> None:
            self.page = page

        async def save_book_async(self, book: Book) -> None:
            self.book = book
            self.saved_books.append(book.model_copy(deep=True))

    storage = FakeStorage()
    engine = BookEngine(storage=storage)  # type: ignore[arg-type]

    async def _compile_page(**kwargs) -> Page:
        page = kwargs["page"]
        page.status = PageStatus.READY
        return page

    async def _skip_finalize(_book_id: str) -> None:
        return None

    monkeypatch.setattr(engine.compiler, "compile_page", _compile_page)
    monkeypatch.setattr(engine, "_maybe_finalize_book", _skip_finalize)

    result = await engine.compile_page(book_id="book-1", page_id="page-1", force=True)

    assert result.status == PageStatus.READY
    assert storage.book.stale_page_ids == ["page-2"]
    assert storage.saved_books


def test_drift_detection_respects_remaining_stale_page_list(monkeypatch) -> None:
    class FakeStorage:
        def list_pages(self, _book_id: str) -> list[Page]:
            return [
                Page(id="page-1", book_id="book-1", status=PageStatus.READY),
                Page(id="page-2", book_id="book-1", status=PageStatus.READY),
            ]

    monkeypatch.setattr(kb_health, "fingerprint_kbs", lambda *_args, **_kwargs: {"kb-1": "new"})
    book = Book(
        id="book-1",
        knowledge_bases=["kb-1"],
        kb_fingerprints={"kb-1": "old"},
        stale_page_ids=["page-2"],
    )

    report = kb_health.detect_kb_drift(book, storage=FakeStorage())  # type: ignore[arg-type]

    assert report.has_drift is True
    assert report.changed_kbs == ["kb-1"]
    assert report.stale_page_ids == ["page-2"]


def test_refresh_fingerprints_updates_book_timestamp(monkeypatch) -> None:
    class FakeStorage:
        def __init__(self) -> None:
            self.book = Book(
                id="book-1",
                knowledge_bases=["kb-1"],
                kb_fingerprints={"kb-1": "old"},
                stale_page_ids=["page-1"],
                updated_at=100,
            )

        def load_book(self, _book_id: str) -> Book:
            return self.book

        def save_book(self, book: Book) -> None:
            self.book = book

        def append_log(self, *_args, **_kwargs) -> None:
            return None

    monkeypatch.setattr(kb_health, "fingerprint_kbs", lambda *_args, **_kwargs: {"kb-1": "new"})
    monkeypatch.setattr(kb_health.time, "time", lambda: 200)
    storage = FakeStorage()

    book = kb_health.refresh_book_fingerprints("book-1", storage=storage)  # type: ignore[arg-type]

    assert book is not None
    assert book.kb_fingerprints == {"kb-1": "new"}
    assert book.stale_page_ids == []
    assert book.updated_at == 200
