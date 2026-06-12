"""Storage operations for the LlamaIndex RAG pipeline."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
import shutil
from typing import Any

from llama_index.core import StorageContext, VectorStoreIndex, load_index_from_storage
from llama_index.core.schema import NodeWithScore, TextNode

from socartes.services.embedding.validation import validate_embedding_batch
from socartes.services.rag import index_versioning
from socartes.services.rag.index_versioning import (
    EmbeddingSignature,
    resolve_storage_dir_for_read,
    resolve_storage_dir_for_write,
)


@dataclass(frozen=True)
class AddStoragePlan:
    existing_storage: Path | None
    storage_dir: Path


_INDEX_CACHE: dict[tuple[str, tuple[tuple[str, int, int], ...]], Any] = {}
_TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?")
_NUMBERED_QUESTION_RE = re.compile(
    r"^\s*(?:Q\d+|Question\s+\d+|\d+)\s*[:.)-]\s*(.+\?)\s*$",
    re.IGNORECASE,
)
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "did",
    "do",
    "does",
    "for",
    "from",
    "had",
    "has",
    "have",
    "he",
    "her",
    "him",
    "his",
    "how",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "say",
    "says",
    "the",
    "their",
    "there",
    "they",
    "this",
    "to",
    "was",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
}


def clear_index_cache() -> None:
    _INDEX_CACHE.clear()


def _storage_fingerprint(storage_dir: Path) -> tuple[tuple[str, int, int], ...]:
    entries: list[tuple[str, int, int]] = []
    if not storage_dir.exists():
        return ()
    for path in sorted(storage_dir.glob("*.json")):
        try:
            stat = path.stat()
        except OSError:
            continue
        entries.append((path.name, stat.st_mtime_ns, stat.st_size))
    return tuple(entries)


def _load_index_cached(storage_dir: Path) -> Any:
    key = (str(storage_dir.resolve()), _storage_fingerprint(storage_dir))
    cached = _INDEX_CACHE.get(key)
    if cached is not None:
        return cached
    storage_context = StorageContext.from_defaults(persist_dir=str(storage_dir))
    index = load_index_from_storage(storage_context)
    _validate_persisted_embeddings(index, storage_dir)
    _INDEX_CACHE[key] = index
    return index


def cleanup_failed_version_dir(storage_dir: Path) -> bool:
    """Remove an empty flat version dir created by a failed indexing attempt."""
    if not storage_dir.is_dir() or not storage_dir.name.startswith("version-"):
        return False
    storage_empty = not any(child for child in storage_dir.iterdir() if child.name != "meta.json")
    meta_path = storage_dir / "meta.json"
    if storage_empty and not meta_path.exists():
        shutil.rmtree(storage_dir, ignore_errors=True)
        return True
    return False


def resolve_add_storage_plan(kb_dir: Path, signature: EmbeddingSignature | None) -> AddStoragePlan:
    """Choose existing/new storage dirs for incremental adds."""
    matching_version = (
        index_versioning.find_matching_version(kb_dir, signature)
        if signature is not None
        else None
    )
    existing_storage = Path(str(matching_version["storage_path"])) if matching_version else None

    if matching_version and matching_version.get("layout") == "flat":
        return AddStoragePlan(existing_storage=existing_storage, storage_dir=existing_storage)

    if matching_version:
        return AddStoragePlan(
            existing_storage=existing_storage,
            storage_dir=resolve_storage_dir_for_write(kb_dir, signature),
        )

    fallback_storage = resolve_storage_dir_for_read(kb_dir, signature)
    existing_storage = fallback_storage
    fallback_is_flat = (
        fallback_storage is not None
        and fallback_storage.parent == kb_dir
        and fallback_storage.name.startswith("version-")
    )
    storage_dir = (
        fallback_storage if fallback_is_flat else resolve_storage_dir_for_write(kb_dir, signature)
    )
    return AddStoragePlan(existing_storage=existing_storage, storage_dir=storage_dir)


def create_index(documents: list[Any], storage_dir: Path, *, show_progress: bool = True) -> int:
    index = VectorStoreIndex.from_documents(documents, show_progress=show_progress)
    index.storage_context.persist(persist_dir=str(storage_dir))
    clear_index_cache()
    return len(documents)


def insert_documents(existing_storage: Path, storage_dir: Path, documents: list[Any]) -> int:
    storage_context = StorageContext.from_defaults(persist_dir=str(existing_storage))
    index = load_index_from_storage(storage_context)
    _validate_persisted_embeddings(index, existing_storage)
    for document in documents:
        index.insert(document)
    index.storage_context.persist(persist_dir=str(storage_dir))
    clear_index_cache()
    return len(documents)


def _validate_embedding_dict(embedding_dict: Any, *, label: str) -> None:
    if not isinstance(embedding_dict, dict) or not embedding_dict:
        return

    validate_embedding_batch(
        list(embedding_dict.values()),
        expected_count=len(embedding_dict),
        binding="llamaindex",
        model=f"persisted-index:{label}",
    )


def _iter_index_embedding_dicts(index: Any):
    """Yield embedding dictionaries exposed by loaded LlamaIndex vector stores."""
    seen: set[int] = set()

    def _yield_store(label: str, vector_store: Any):
        if vector_store is None:
            return
        store_id = id(vector_store)
        if store_id in seen:
            return
        seen.add(store_id)
        data = getattr(vector_store, "data", None)
        embedding_dict = getattr(data, "embedding_dict", None)
        if isinstance(embedding_dict, dict):
            yield label, embedding_dict

    yield from _yield_store("default", getattr(index, "vector_store", None))

    storage_context = getattr(index, "storage_context", None)
    vector_stores = getattr(storage_context, "vector_stores", None)
    if isinstance(vector_stores, dict):
        for namespace, vector_store in vector_stores.items():
            yield from _yield_store(str(namespace), vector_store)


def _embedding_dict_from_payload(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return None
    if isinstance(payload.get("embedding_dict"), dict):
        return payload["embedding_dict"]
    data = payload.get("data")
    if isinstance(data, dict) and isinstance(data.get("embedding_dict"), dict):
        return data["embedding_dict"]
    return None


def _iter_file_embedding_dicts(storage_dir: Path):
    """Yield embedding dictionaries from persisted vector-store JSON files."""
    for path in sorted(storage_dir.glob("*vector_store.json")):
        try:
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except Exception:
            continue
        embedding_dict = _embedding_dict_from_payload(payload)
        if isinstance(embedding_dict, dict):
            yield path.name, embedding_dict


def _validate_persisted_embeddings(index: Any, storage_dir: Path | None = None) -> None:
    """Fail early when a persisted vector store contains unusable vectors."""
    try:
        for label, embedding_dict in _iter_index_embedding_dicts(index):
            _validate_embedding_dict(embedding_dict, label=label)
        if storage_dir is not None:
            for label, embedding_dict in _iter_file_embedding_dicts(storage_dir):
                _validate_embedding_dict(embedding_dict, label=label)
    except ValueError as exc:
        raise ValueError(
            "RAG index contains invalid embedding vectors. Re-index the "
            "knowledge base with the current embedding provider/model before "
            f"querying it again. Details: {exc}"
        ) from exc


def validate_storage_embeddings(storage_dir: Path) -> None:
    """Validate persisted vector-store files without running a retrieval."""
    _validate_persisted_embeddings(None, storage_dir)


def _load_docstore_entries(storage_dir: Path) -> dict[str, dict[str, Any]]:
    docstore_path = storage_dir / "docstore.json"
    try:
        with open(docstore_path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}

    raw_entries = payload.get("docstore/data")
    if not isinstance(raw_entries, dict):
        return {}

    entries: dict[str, dict[str, Any]] = {}
    for fallback_id, raw_entry in raw_entries.items():
        if not isinstance(raw_entry, dict):
            continue
        data = raw_entry.get("__data__", raw_entry)
        if not isinstance(data, dict):
            continue
        text = data.get("text")
        if not isinstance(text, str) or not text.strip():
            continue
        node_id = data.get("id_") or data.get("id") or fallback_id
        if isinstance(node_id, str) and node_id:
            entries[node_id] = data
    return entries


def _tokenize_for_search(text: str) -> list[str]:
    return [
        token.lower()
        for token in _TOKEN_RE.findall(text)
        if len(token) > 1 and token.lower() not in _STOPWORDS
    ]


def _lexical_score(query_tokens: list[str], text: str) -> float:
    if not query_tokens:
        return 0.0

    text_lower = text.lower()
    text_tokens = set(_tokenize_for_search(text))
    hits = [token for token in query_tokens if token in text_tokens]
    if not hits:
        return 0.0

    score = float(len(hits))
    for left, right in zip(query_tokens, query_tokens[1:]):
        if f"{left} {right}" in text_lower:
            score += 1.5
    return score


def _split_lexical_queries(query: str) -> list[str]:
    subqueries: list[str] = []
    for line in query.splitlines():
        match = _NUMBERED_QUESTION_RE.match(line.strip())
        if match:
            subqueries.append(match.group(1).strip())
    return subqueries or [query]


def _relationship_node_id(entry: dict[str, Any], relationship_key: str) -> str | None:
    relationships = entry.get("relationships")
    if not isinstance(relationships, dict):
        return None
    relationship = relationships.get(relationship_key)
    if not isinstance(relationship, dict):
        return None
    node_id = relationship.get("node_id")
    return node_id if isinstance(node_id, str) and node_id else None


def _node_id_from_result(result: Any) -> str | None:
    node = getattr(result, "node", result)
    for attr in ("node_id", "id_", "id"):
        value = getattr(node, attr, None)
        if isinstance(value, str) and value:
            return value
    return None


def _node_from_docstore_entry(node_id: str, entry: dict[str, Any], score: float) -> NodeWithScore:
    metadata = entry.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    return NodeWithScore(
        node=TextNode(text=entry["text"], id_=node_id, metadata=metadata),
        score=score,
    )


def _append_docstore_node(
    output: list[Any],
    seen: set[str],
    entries: dict[str, dict[str, Any]],
    node_id: str | None,
    score: float,
) -> bool:
    if not node_id or node_id in seen:
        return False
    entry = entries.get(node_id)
    if entry is None:
        return False
    output.append(_node_from_docstore_entry(node_id, entry, score))
    seen.add(node_id)
    return True


def _append_adjacent_nodes(
    output: list[Any],
    seen: set[str],
    entries: dict[str, dict[str, Any]],
    start_node_id: str,
    *,
    score: float,
    adjacent_hops: int,
) -> None:
    frontier = [start_node_id]
    for _ in range(adjacent_hops):
        next_frontier: list[str] = []
        for node_id in frontier:
            entry = entries.get(node_id)
            if entry is None:
                continue
            for relationship_key in ("2", "3"):
                adjacent_id = _relationship_node_id(entry, relationship_key)
                if _append_docstore_node(output, seen, entries, adjacent_id, score):
                    next_frontier.append(adjacent_id)
        frontier = next_frontier


def augment_retrieved_nodes(
    storage_dir: Path,
    query: str,
    vector_nodes: list[Any],
    *,
    lexical_top_k: int = 3,
    adjacent_hops: int = 1,
) -> list[Any]:
    """Augment vector retrieval with lexical hits and neighboring chunks."""
    entries = _load_docstore_entries(storage_dir)
    if not entries:
        return vector_nodes

    output: list[Any] = []
    seen: set[str] = set()

    for lexical_query in _split_lexical_queries(query):
        query_tokens = _tokenize_for_search(lexical_query)
        lexical_matches = sorted(
            (
                (_lexical_score(query_tokens, entry["text"]), node_id)
                for node_id, entry in entries.items()
            ),
            key=lambda item: item[0],
            reverse=True,
        )

        for score, node_id in lexical_matches[: max(0, lexical_top_k)]:
            if score <= 0:
                continue
            if _append_docstore_node(output, seen, entries, node_id, score):
                _append_adjacent_nodes(
                    output,
                    seen,
                    entries,
                    node_id,
                    score=max(score - 0.1, 0.1),
                    adjacent_hops=max(0, adjacent_hops),
            )

    for node in vector_nodes:
        node_id = _node_id_from_result(node)
        if node_id and node_id in seen:
            continue
        output.append(node)
        if node_id:
            seen.add(node_id)
    return output


def retrieve_nodes(storage_dir: Path, query: str, *, top_k: int = 5) -> list[Any]:
    index = _load_index_cached(storage_dir)
    retriever = index.as_retriever(similarity_top_k=top_k)
    nodes = retriever.retrieve(query)
    return augment_retrieved_nodes(storage_dir, query, nodes)


def delete_kb_dir(kb_dir: Path) -> bool:
    if kb_dir.exists():
        shutil.rmtree(kb_dir)
        clear_index_cache()
        return True
    return False
