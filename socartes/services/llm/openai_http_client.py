"""HTTP client helpers for OpenAI-compatible SDK providers."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import uuid
from typing import Any

import httpx

from socartes.services.llm.exceptions import LLMConfigError

logger = logging.getLogger(__name__)

_TRUTHY = {"1", "true", "yes", "on"}
_warning_lock = threading.Lock()
_warning_logged = False
_cache_lock = threading.RLock()
_HTTPX_CLIENT_CACHE: dict[tuple[Any, ...], httpx.AsyncClient] = {}
_ASYNC_OPENAI_CLIENT_CACHE: dict[tuple[Any, ...], Any] = {}
_AIOHTTP_SESSION_CACHE: dict[tuple[Any, ...], Any] = {}


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in _TRUTHY


def disable_ssl_verify_enabled() -> bool:
    """Return whether outbound TLS verification should be disabled."""
    if not _env_truthy("DISABLE_SSL_VERIFY"):
        return False
    if os.getenv("ENVIRONMENT", "").strip().lower() in {"prod", "production"}:
        raise LLMConfigError("DISABLE_SSL_VERIFY is not allowed in production")
    global _warning_logged
    with _warning_lock:
        if not _warning_logged:
            logger.warning(
                "SSL verification is disabled via DISABLE_SSL_VERIFY. This is unsafe "
                "and must not be used in production environments."
            )
            _warning_logged = True
    return True


def _event_loop_key() -> int:
    try:
        return id(asyncio.get_running_loop())
    except RuntimeError:
        return 0


def _freeze_mapping(mapping: dict[str, Any] | None) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((str(key), repr(value)) for key, value in (mapping or {}).items()))


def _header_cache_key(headers: dict[str, str] | None) -> tuple[tuple[str, str], ...]:
    return tuple(
        sorted(
            (str(key), str(value))
            for key, value in (headers or {}).items()
            if str(key).lower() != "x-session-affinity"
        )
    )


def clear_cached_http_clients() -> None:
    """Forget cached async HTTP/SDK clients.

    Intended for tests and config reload hooks. Long-running app shutdown should
    prefer ``close_cached_http_clients`` so open pools close cleanly.
    """
    with _cache_lock:
        _HTTPX_CLIENT_CACHE.clear()
        _ASYNC_OPENAI_CLIENT_CACHE.clear()
        _AIOHTTP_SESSION_CACHE.clear()


async def close_cached_http_clients() -> None:
    """Close all cached async HTTP clients and clear the pools."""
    with _cache_lock:
        httpx_clients = list(_HTTPX_CLIENT_CACHE.values())
        aiohttp_sessions = list(_AIOHTTP_SESSION_CACHE.values())
        _HTTPX_CLIENT_CACHE.clear()
        _ASYNC_OPENAI_CLIENT_CACHE.clear()
        _AIOHTTP_SESSION_CACHE.clear()

    for client in httpx_clients:
        if not getattr(client, "is_closed", False):
            await client.aclose()
    for session in aiohttp_sessions:
        if not getattr(session, "closed", False):
            await session.close()


def build_openai_http_client(**kwargs: Any) -> httpx.AsyncClient | None:
    """Build a custom SDK httpx client when DISABLE_SSL_VERIFY is enabled."""
    if not disable_ssl_verify_enabled():
        return None
    return httpx.AsyncClient(verify=False, **kwargs)  # nosec B501


def get_cached_openai_http_client(**kwargs: Any) -> httpx.AsyncClient | None:
    """Return a pooled custom SDK httpx client when SSL override is enabled."""
    if not disable_ssl_verify_enabled():
        return None
    key = (_event_loop_key(), "openai-sdk-httpx", _freeze_mapping(kwargs))
    with _cache_lock:
        cached = _HTTPX_CLIENT_CACHE.get(key)
        if cached is not None and not getattr(cached, "is_closed", False):
            return cached
        client = httpx.AsyncClient(verify=False, **kwargs)  # nosec B501
        _HTTPX_CLIENT_CACHE[key] = client
        return client


def openai_client_kwargs(**httpx_kwargs: Any) -> dict[str, httpx.AsyncClient]:
    """Return kwargs to pass into ``AsyncOpenAI`` for custom HTTP behavior."""
    client = get_cached_openai_http_client(**httpx_kwargs)
    return {"http_client": client} if client is not None else {}


def get_cached_async_openai_client(
    *,
    provider_name: str,
    api_key: str | None,
    base_url: str | None,
    default_headers: dict[str, str] | None = None,
    max_retries: int = 0,
    async_openai_factory: Any | None = None,
    **httpx_kwargs: Any,
) -> Any:
    """Return a pooled ``AsyncOpenAI`` client for identical provider endpoints."""
    if async_openai_factory is None:
        from openai import AsyncOpenAI as async_openai_factory

    headers = dict(default_headers or {})
    headers.setdefault("x-session-affinity", uuid.uuid4().hex)
    key = (
        _event_loop_key(),
        "async-openai",
        provider_name,
        api_key or "no-key",
        base_url or "",
        max_retries,
        _header_cache_key(headers),
        _freeze_mapping(httpx_kwargs),
        disable_ssl_verify_enabled(),
        id(async_openai_factory),
    )
    with _cache_lock:
        cached = _ASYNC_OPENAI_CLIENT_CACHE.get(key)
        if cached is not None:
            return cached
        client = async_openai_factory(
            api_key=api_key or "no-key",
            base_url=base_url,
            default_headers=headers,
            max_retries=max_retries,
            **openai_client_kwargs(**httpx_kwargs),
        )
        _ASYNC_OPENAI_CLIENT_CACHE[key] = client
        return client


def get_cached_aiohttp_session(
    *,
    owner: str,
    base_url: str | None,
    api_key: str | None,
    timeout_total: int | float,
    trust_env: bool = True,
    client_session_factory: Any | None = None,
    timeout_factory: Any | None = None,
    connector_factory: Any | None = None,
) -> Any:
    """Return a pooled aiohttp session for identical provider endpoints."""
    import aiohttp

    client_session_factory = client_session_factory or aiohttp.ClientSession
    timeout_factory = timeout_factory or aiohttp.ClientTimeout
    connector_factory = connector_factory or aiohttp.TCPConnector
    disable_ssl = disable_ssl_verify_enabled()
    key = (
        _event_loop_key(),
        "aiohttp",
        owner,
        base_url or "",
        api_key or "",
        float(timeout_total),
        trust_env,
        disable_ssl,
        id(client_session_factory),
    )
    with _cache_lock:
        cached = _AIOHTTP_SESSION_CACHE.get(key)
        if cached is not None and not getattr(cached, "closed", False):
            return cached
        connector = connector_factory(ssl=False) if disable_ssl else None
        session = client_session_factory(
            timeout=timeout_factory(total=timeout_total),
            connector=connector,
            trust_env=trust_env,
        )
        _AIOHTTP_SESSION_CACHE[key] = session
        return session


__all__ = [
    "build_openai_http_client",
    "clear_cached_http_clients",
    "close_cached_http_clients",
    "disable_ssl_verify_enabled",
    "get_cached_aiohttp_session",
    "get_cached_async_openai_client",
    "get_cached_openai_http_client",
    "openai_client_kwargs",
]
