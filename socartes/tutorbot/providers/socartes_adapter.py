"""LLM provider adapter that reuses Socartes's LLM configuration.

When TutorBot runs in-process inside the Socartes server, this provider
reads api_key / model / base_url from Socartes's unified config and
delegates to the appropriate provider (OpenAICompat or Anthropic).
"""

from __future__ import annotations

from typing import cast

from socartes.services.llm.config import LLMConfig
from socartes.tutorbot.providers.base import LLMProvider


def create_socartes_provider(config: LLMConfig | None = None) -> LLMProvider:
    """Build a provider pre-configured from Socartes's LLMConfig."""
    from socartes.services.llm.provider_factory import get_runtime_provider

    return cast(LLMProvider, get_runtime_provider(config))
