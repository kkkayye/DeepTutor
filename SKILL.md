# Socartes CLI Skill

> Teach your AI agent to configure, manage, and use Socartes — an intelligent learning platform — entirely through the command line.

## When to Use

Use this skill when the user wants to:
- Set up or configure Socartes
- Chat with Socartes or run a capability (deep solve, quiz generation, deep research, math animation)
- Create, manage, or search knowledge bases
- Manage TutorBot instances
- View or manage learning memory, sessions, or notebooks
- Start the Socartes API server

## Prerequisites

- Python 3.11+
- Socartes installed: `pip install -e ".[cli]"` (CLI + RAG + providers) or `pip install -e ".[server]"` (adds web/API)
- Run `python scripts/start_tour.py` for first-time interactive setup (configures LLM, embedding, search providers and writes `.env`)

## Commands

### Chat & Capabilities

```bash
# Interactive REPL
socartes chat
socartes chat --capability deep_solve --kb my-kb --tool rag --tool web_search

# One-shot capability execution
socartes run chat "Explain Fourier transform"
socartes run deep_solve "Solve x^2 = 4" --tool rag --kb textbook
socartes run deep_question "Linear algebra" --config num_questions=5
socartes run deep_research "Attention mechanisms" --kb papers
socartes run math_animator "Visualize a Fourier series"

# Options for `run`:
#   --session <id>         Resume existing session
#   --tool/-t <name>       Enable tool (repeatable): rag, web_search, code_execution, reason, brainstorm, paper_search
#   --kb <name>            Knowledge base (repeatable)
#   --notebook-ref <ref>   Notebook reference (repeatable)
#   --history-ref <id>     Referenced session id (repeatable)
#   --language/-l <code>   Response language (default: en)
#   --config <key=value>   Capability config (repeatable)
#   --config-json <json>   Capability config as JSON
#   --format/-f <fmt>      Output format: rich | json
```

### Knowledge Bases

```bash
socartes kb list                              # List all knowledge bases
socartes kb info <name>                       # Show knowledge base details
socartes kb create <name> --doc file.pdf      # Create from documents (--doc repeatable)
socartes kb add <name> --doc more.pdf         # Add documents incrementally
socartes kb search <name> "query text"        # Search a knowledge base
socartes kb set-default <name>                # Set as default KB
socartes kb delete <name> [--force]           # Delete a knowledge base
```

### TutorBot

```bash
socartes bot list                             # List all TutorBot instances
socartes bot create <id> --name "My Tutor"    # Create and start a new bot
socartes bot start <id>                       # Start a bot
socartes bot stop <id>                        # Stop a bot
```

### Memory

```bash
socartes memory show [summary|profile|all]    # View learning memory
socartes memory clear [summary|profile|all]   # Clear memory (--force to skip confirm)
```

### Sessions

```bash
socartes session list [--limit 20]            # List sessions
socartes session show <id>                    # View session messages
socartes session open <id>                    # Resume session in REPL
socartes session rename <id> --title "..."    # Rename a session
socartes session delete <id>                  # Delete a session
```

### Notebooks

```bash
socartes notebook list                        # List notebooks
socartes notebook create <name>               # Create a notebook
socartes notebook show <id>                   # View notebook records
socartes notebook add-md <id> <file.md>       # Import markdown as record
socartes notebook replace-md <id> <rec> <f>   # Replace a markdown record
socartes notebook remove-record <id> <rec>    # Remove a record
```

### System

```bash
socartes config show                          # Print current configuration
socartes plugin list                          # List registered tools and capabilities
socartes plugin info <name>                   # Show tool/capability details
socartes provider login <provider>            # OAuth login (openai-codex, github-copilot)
socartes serve [--port 8001] [--reload]       # Start API server
```

## REPL Slash Commands

Inside `socartes chat`, use these:

| Command | Effect |
|:---|:---|
| `/quit` | Exit REPL |
| `/session` | Show current session id |
| `/new` | Start a new session |
| `/tool on\|off <name>` | Toggle a tool |
| `/cap <name>` | Switch capability |
| `/kb <name>\|none` | Set or clear knowledge base |
| `/history add <id>` / `/history clear` | Manage history references |
| `/notebook add <ref>` / `/notebook clear` | Manage notebook references |
| `/refs` | Show active references |
| `/config show\|set\|clear` | Manage capability config |

## Typical Workflows

**First-time setup:**
```bash
cd Socartes
pip install -e ".[server]"
python scripts/start_tour.py    # Interactive guided setup
```

**Daily learning:**
```bash
socartes chat --kb textbook --tool rag --tool web_search
```

**Build a knowledge base from documents:**
```bash
socartes kb create physics --doc ch1.pdf --doc ch2.pdf
socartes run chat "Explain Newton's third law" --kb physics --tool rag
```

**Generate quiz questions:**
```bash
socartes run deep_question "Thermodynamics" --kb physics --config num_questions=5
```
