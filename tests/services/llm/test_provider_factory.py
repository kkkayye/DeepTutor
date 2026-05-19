from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from socartes.services.llm.config import LLMConfig


def _make_cfg(**overrides: Any) -> LLMConfig:
    defaults = dict(
        model="gpt-4o-mini",
        api_key="test-key",
        base_url="https://api.example.com/v1",
        effective_url="https://api.example.com/v1",
        binding="openai",
        provider_name="openai",
        provider_mode="standard",
        extra_headers={},
    )
    defaults.update(overrides)
    return LLMConfig(**defaults)


def test_runtime_provider_reuses_cached_provider_for_same_config(monkeypatch) -> None:
    from socartes.services.llm import provider_factory

    provider_factory.clear_runtime_provider_cache()
    created: list[dict[str, Any]] = []

    class _FakeProvider:
        def __init__(self, **kwargs: Any) -> None:
            created.append(kwargs)
            self.generation = None

    monkeypatch.setattr(provider_factory, "OpenAICompatProvider", _FakeProvider)
    monkeypatch.setattr(
        provider_factory,
        "find_by_name",
        lambda name: SimpleNamespace(backend="openai_compat", supports_prompt_caching=False),
    )

    cfg = _make_cfg(extra_headers={"X-Test": "1"})
    first = provider_factory.get_runtime_provider(cfg)
    second = provider_factory.get_runtime_provider(cfg.model_copy())

    assert first is second
    assert len(created) == 1
    provider_factory.clear_runtime_provider_cache()
