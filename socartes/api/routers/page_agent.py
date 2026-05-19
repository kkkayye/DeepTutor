"""Page-agent OpenAI-compatible chat completion endpoint."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from socartes.services.provider_registry import find_by_name

logger = logging.getLogger(__name__)
router = APIRouter()


class Message(BaseModel):
    role: str
    content: Any = None
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None

    model_config = ConfigDict(extra="allow")


class Tool(BaseModel):
    type: str
    function: dict[str, Any]

    model_config = ConfigDict(extra="allow")


class ToolChoice(BaseModel):
    type: str | None = None
    function: dict[str, Any] | None = None

    model_config = ConfigDict(extra="allow")


class ChatCompletionRequest(BaseModel):
    messages: list[Message]
    tools: list[Tool] | None = None
    tool_choice: ToolChoice | str | dict[str, Any] | None = None
    temperature: float | None = None
    model: str | None = None

    model_config = ConfigDict(extra="allow")


def get_llm_config():
    from socartes.services.llm.config import get_llm_config as load_llm_config

    return load_llm_config()


def _provider_backend(config: Any) -> str:
    spec = find_by_name(config.provider_name) or find_by_name(config.binding)
    if spec:
        return spec.backend
    binding = (config.binding or "").lower()
    if binding in {"azure", "azure_openai"}:
        return "azure_openai"
    if binding in {"anthropic", "claude", "cohere"}:
        return ""
    return "openai_compat"


def _build_openai_client(config: Any):
    from openai import AsyncAzureOpenAI, AsyncOpenAI

    http_client = None
    if os.getenv("DISABLE_SSL_VERIFY", "").lower() in {"true", "1", "yes"}:
        http_client = httpx.AsyncClient(verify=False)  # nosec B501

    default_headers = config.extra_headers or None
    base_url = config.effective_url or config.base_url
    api_key = config.api_key or "sk-no-key-required"
    if _provider_backend(config) == "azure_openai":
        return AsyncAzureOpenAI(
            api_key=api_key,
            azure_endpoint=base_url,
            api_version=config.api_version,
            http_client=http_client,
            default_headers=default_headers,
        )
    return AsyncOpenAI(
        api_key=api_key,
        base_url=base_url or None,
        http_client=http_client,
        default_headers=default_headers,
    )


def _fallback_completion(model: str = "socartes-page-agent-fallback") -> dict[str, Any]:
    arguments = {
        "type": "done",
        "message": (
            "Page agent LLM tool-calling is not configured. "
            "Configure an OpenAI-compatible chat provider to enable page actions."
        ),
    }
    return {
        "id": f"chatcmpl-page-agent-{uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": f"call_{uuid4().hex[:24]}",
                            "type": "function",
                            "function": {
                                "name": "AgentOutput",
                                "arguments": json.dumps(arguments, ensure_ascii=False),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


@router.post("/openai/v1/chat/completions")
async def create_chat_completion(request: ChatCompletionRequest) -> dict[str, Any]:
    try:
        llm_config = get_llm_config()
    except Exception:
        logger.exception("Page-agent LLM configuration is unavailable")
        return _fallback_completion(request.model or "socartes-page-agent-fallback")

    if _provider_backend(llm_config) not in {"openai_compat", "azure_openai"}:
        logger.warning(
            "Page-agent provider %s does not expose OpenAI chat completions",
            llm_config.provider_name or llm_config.binding,
        )
        return _fallback_completion(request.model or llm_config.model)

    payload = request.model_dump(exclude_none=True, mode="json")
    payload["model"] = request.model or llm_config.model
    client = None
    try:
        client = _build_openai_client(llm_config)
        response = await client.chat.completions.create(**payload)
    except Exception as exc:
        logger.exception("Page-agent chat completion failed")
        raise HTTPException(
            status_code=502,
            detail=f"Page-agent LLM request failed: {exc}",
        ) from exc
    finally:
        if client is not None:
            await client.close()

    return response.model_dump(mode="json")
