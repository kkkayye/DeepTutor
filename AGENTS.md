# Socartes — Agent-Native Architecture

## Overview

Socartes is an **agent-native** intelligent learning companion built around
a two-layer plugin model (Tools + Capabilities) with three entry points:
CLI, WebSocket API, and Python SDK.

## Architecture

```
Entry Points:  CLI (Typer)  |  WebSocket /api/v1/ws  |  Python SDK
                    ↓                   ↓                   ↓
              ┌─────────────────────────────────────────────────┐
              │              ChatOrchestrator                    │
              │   routes to ChatCapability (default)             │
              │   or a selected deep Capability                  │
              └──────────┬──────────────┬───────────────────────┘
                         │              │
              ┌──────────▼──┐  ┌────────▼──────────┐
              │ ToolRegistry │  │ CapabilityRegistry │
              │  (Level 1)   │  │   (Level 2)        │
              └──────────────┘  └────────────────────┘
```

### Level 1 — Tools

Lightweight single-function tools the LLM calls on demand:

| Tool                | Description                                    |
| ------------------- | ---------------------------------------------- |
| `rag`               | Knowledge base retrieval (RAG)                 |
| `web_search`        | Web search with citations                      |
| `code_execution`    | Sandboxed Python execution                     |
| `reason`            | Dedicated deep-reasoning LLM call              |
| `brainstorm`        | Breadth-first idea exploration with rationale  |
| `paper_search`      | arXiv academic paper search                    |
| `geogebra_analysis` | Image → GeoGebra commands (4-stage vision pipeline) |

### Level 2 — Capabilities

Multi-step agent pipelines that take over the conversation:

| Capability       | Stages                                         |
| ---------------- | ---------------------------------------------- |
| `chat`           | responding (default, tool-augmented)           |
| `deep_solve`     | planning → reasoning → writing                 |
| `deep_question`  | ideation → evaluation → generation → validation |

### Playground Plugins

Extended features in `socartes/plugins/`:

| Plugin            | Type       | Description                          |
| ----------------- | ---------- | ------------------------------------ |
| `deep_research`   | playground | Multi-agent research + reporting     |

## CLI Usage

```bash
# Install CLI
pip install -e ".[cli]"

# Run any capability (agent-first entry point)
socartes run chat "Explain Fourier transform"
socartes run deep_solve "Solve x^2=4" -t rag --kb my-kb
socartes run deep_question "Linear algebra" --config num_questions=5

# Interactive REPL
socartes chat
# (inside the REPL: /regenerate or /retry re-runs the last user message)

# Knowledge bases
socartes kb list
socartes kb create my-kb --doc textbook.pdf

# Plugins & memory
socartes plugin list
socartes memory show

# API server (requires .[server])
socartes serve --port 8001
```

## Key Files

| Path                          | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `socartes/runtime/orchestrator.py` | ChatOrchestrator — unified entry     |
| `socartes/core/stream.py`          | StreamEvent protocol                 |
| `socartes/core/stream_bus.py`      | Async event fan-out                  |
| `socartes/core/tool_protocol.py`   | BaseTool abstract class              |
| `socartes/core/capability_protocol.py` | BaseCapability abstract class    |
| `socartes/core/context.py`         | UnifiedContext dataclass             |
| `socartes/runtime/registry/tool_registry.py` | Tool discovery & registration |
| `socartes/runtime/registry/capability_registry.py` | Capability discovery & registration |
| `socartes/runtime/mode.py`         | RunMode (CLI vs SERVER)              |
| `socartes/capabilities/`           | Built-in capability wrappers         |
| `socartes/tools/builtin/`          | Built-in tool wrappers               |
| `socartes/plugins/`                | Playground plugins                   |
| `socartes/plugins/loader.py`       | Plugin discovery from manifest.yaml  |
| `socartes_cli/main.py`             | Typer CLI entry point                |
| `socartes/api/routers/unified_ws.py` | Unified WebSocket endpoint         |

## Plugin Development

Create a directory under `socartes/plugins/<name>/` with:

```
manifest.yaml     # name, version, type, description, stages
capability.py     # class extending BaseCapability
```

Minimal `manifest.yaml`:
```yaml
name: my_plugin
version: 0.1.0
type: playground
description: "My custom plugin"
stages: [step1, step2]
```

Minimal `capability.py`:
```python
from socartes.core.capability_protocol import BaseCapability, CapabilityManifest
from socartes.core.context import UnifiedContext
from socartes.core.stream_bus import StreamBus

class MyPlugin(BaseCapability):
    manifest = CapabilityManifest(
        name="my_plugin",
        description="My custom plugin",
        stages=["step1", "step2"],
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        async with stream.stage("step1", source=self.name):
            await stream.content("Working on step 1...", source=self.name)
        await stream.result({"response": "Done!"}, source=self.name)
```

## Dependency Layers

Defined in `pyproject.toml` `[project.optional-dependencies]`. Mirrored as flat
lists in `requirements/*.txt` for Docker/CI installs without source code.

```
.[cli]            — CLI full (LLM + RAG + providers + document parsing)
.[server]         — .[cli] + FastAPI/uvicorn (for Web/API)
.[tutorbot]       — .[server] + TutorBot agent engine + channel SDKs
.[matrix]         — Matrix channel for TutorBot (matrix-nio[e2e]; needs libolm)
.[math-animator]  — Manim addon (for `socartes animate`)
.[dev]            — .[server] + test/lint tools
.[all]            — Everything above
```

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Socartes** (26733 symbols, 47035 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Socartes/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Socartes/clusters` | All functional areas |
| `gitnexus://repo/Socartes/processes` | All execution flows |
| `gitnexus://repo/Socartes/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
