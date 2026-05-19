"""Factory for services-layer provider runtime objects."""

from __future__ import annotations

from typing import Any

from socartes.services.llm.config import LLMConfig, get_llm_config
from socartes.services.llm.provider_core import (
    AnthropicProvider,
    AzureOpenAIProvider,
    GenerationSettings,
    GitHubCopilotProvider,
    LLMProvider,
    OpenAICodexProvider,
    OpenAICompatProvider,
)
from socartes.services.provider_registry import find_by_name

_ProviderCacheKey = tuple[Any, ...]

_PROVIDER_CACHE: dict[_ProviderCacheKey, LLMProvider] = {}


def _freeze_headers(headers: dict[str, str] | None) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((str(key), str(value)) for key, value in (headers or {}).items()))


def _runtime_provider_cache_key(
    llm_config: LLMConfig,
    *,
    backend: str,
    provider_name: str,
) -> _ProviderCacheKey:
    return (
        backend,
        provider_name,
        llm_config.model,
        llm_config.api_key,
        llm_config.effective_url or llm_config.base_url,
        llm_config.base_url,
        llm_config.binding,
        llm_config.provider_mode,
        llm_config.api_version,
        _freeze_headers(llm_config.extra_headers),
    )


def clear_runtime_provider_cache() -> None:
    """Drop cached provider instances after runtime provider settings change."""
    _PROVIDER_CACHE.clear()


def _apply_generation_settings(provider: LLMProvider, llm_config: LLMConfig) -> LLMProvider:
    provider.generation = GenerationSettings(
        temperature=llm_config.temperature,
        max_tokens=llm_config.max_tokens,
        reasoning_effort=llm_config.reasoning_effort,
    )
    return provider


def get_runtime_provider(config: LLMConfig | None = None) -> LLMProvider:
    """Build the authoritative services-layer provider for the supplied config."""
    llm_config = config or get_llm_config()
    provider_name = llm_config.provider_name or llm_config.binding
    spec = find_by_name(provider_name)
    backend = spec.backend if spec else "openai_compat"
    cache_key = _runtime_provider_cache_key(
        llm_config,
        backend=backend,
        provider_name=provider_name,
    )

    cached = _PROVIDER_CACHE.get(cache_key)
    if cached is not None:
        return _apply_generation_settings(cached, llm_config)

    if backend == "openai_codex":
        provider: LLMProvider = OpenAICodexProvider(default_model=llm_config.model)
    elif backend == "github_copilot":
        provider = GitHubCopilotProvider(default_model=llm_config.model)
    elif backend == "azure_openai":
        provider = AzureOpenAIProvider(
            api_key=llm_config.api_key or "",
            api_base=llm_config.effective_url or llm_config.base_url or "",
            default_model=llm_config.model,
            extra_headers=llm_config.extra_headers or None,
        )
    elif backend == "anthropic":
        provider = AnthropicProvider(
            api_key=llm_config.api_key or None,
            api_base=llm_config.effective_url or llm_config.base_url or None,
            default_model=llm_config.model,
            extra_headers=llm_config.extra_headers or None,
            supports_prompt_caching=bool(spec and spec.supports_prompt_caching),
        )
    else:
        provider = OpenAICompatProvider(
            api_key=llm_config.api_key or None,
            api_base=llm_config.effective_url or llm_config.base_url or None,
            default_model=llm_config.model,
            extra_headers=llm_config.extra_headers or None,
            spec=spec,
            provider_name=provider_name,
        )

    _PROVIDER_CACHE[cache_key] = provider
    return _apply_generation_settings(provider, llm_config)


__all__ = [
    "clear_runtime_provider_cache",
    "get_runtime_provider",
]
