const FENCE = "```";

export const CO_WRITER_SAMPLE_TEMPLATE = `# Socartes Co-Writer

> Socartes's built-in writing canvas for notes, reports, tutorials, and AI-assisted drafts.

### Features

- Support Standard Markdown / CommonMark / GFM for everyday writing
- Real-time preview for headings, tables, code, math, flowchart, and sequence diagrams
- AI editing workflows for rewrite, shorten, and expand
- HTML tag decoding for tags like <sub>, <sup>, <abbr>, and <mark>
- A practical starter draft for Socartes product docs and learning content

## Table of Contents

[TOCM]

[TOC]

#Socartes Mission
##Socartes Product Surface
###Socartes Learning Experience
####Socartes Co-Writer
#####Socartes Knowledge Layer
######Socartes Agent Runtime

#Socartes Docs [Project Overview](#socartes-mission "Jump to project overview")
##Socartes Authoring [Co-Writer Section](#socartes-co-writer "Jump to co-writer section")
###Socartes Research [Learning Note](#socartes-learning-note "Jump to learning note")

## Headers (Underline)

Socartes Learning Note
=============

Socartes Study Outline
-------------

### Characters

----

~~Deprecated behavior~~ <s>Legacy formatting path</s>
*Italic* _Italic_
**Emphasis** __Emphasis__
***Emphasis Italic*** ___Emphasis Italic___

Superscript: X<sub>2</sub>, Subscript: O<sup>2</sup>

**Abbreviation(link HTML abbr tag)**

The <abbr title="Large Language Model">LLM</abbr> layer powers Socartes while the <abbr title="Retrieval Augmented Generation">RAG</abbr> layer provides grounded knowledge support.

### Blockquotes

> Socartes helps students turn questions into structured understanding.
>
> "Learn deeply, write clearly.", [Socartes](#socartes-co-writer)

### Links

[Socartes Overview](#socartes-mission)

[Socartes Co-Writer](#socartes-co-writer "co-writer section")

[Socartes Runtime](#socartes-agent-runtime)

[Reference link][socartes-doc]

[socartes-doc]: #socartes-learning-note

### Code Blocks

#### Inline code

\`socartes chat --once "Summarize this section"\`

#### Code Blocks (Indented style)

    from socartes.runtime.orchestrator import ChatOrchestrator
    orchestrator = ChatOrchestrator()
    print("Socartes is ready.")

#### Python

${FENCE}python
from socartes.runtime.orchestrator import ChatOrchestrator
from socartes.core.context import UnifiedContext


async def run_demo() -> str:
    orchestrator = ChatOrchestrator()
    context = UnifiedContext(
        user_query="Explain Newton's second law",
        capability="chat",
    )
    result = await orchestrator.run(context)
    return result.get("response", "")
${FENCE}

#### JSON config

${FENCE}json
{
  "app_name": "Socartes",
  "default_capability": "chat",
  "enabled_tools": ["rag", "web_search", "code_execution", "reason"],
  "ui": {
    "co_writer_template": true
  }
}
${FENCE}

#### HTML code

${FENCE}html
<section class="socartes-card">
  <h1>Socartes</h1>
  <p>Write, revise, and organize learning content with AI.</p>
</section>
${FENCE}

### Images

![](/logo-ver2.png)

> Socartes brand mark used inside the co-writer template.

### Lists

- Socartes Chat
- Socartes Co-Writer
- Socartes Research

1. Draft a concept note
2. Ask AI to refine it
3. Export the polished markdown

### Tables

Feature       | Description
------------- | -------------
Co-Writer     | Draft and refine Markdown content
Chat          | Ask questions and iterate ideas
Research      | Build structured multi-step reports

| Capability    | Primary Use Case                     |
| ------------- | ------------------------------------ |
| \`chat\`       | General tutoring and guidance        |
| \`deep_solve\` | Structured problem solving           |
| \`deep_question\` | Question generation and validation |

### Markdown extras

- [x] Draft a Socartes product note
- [x] Add references and structure
- [ ] Polish the final explanation
  - [ ] Check headings
  - [ ] Check citations

### TeX (LaTeX)

$$ E=mc^2 $$

Inline $$E=mc^2$$ appears in physics notes, and Inline $$a^2+b^2=c^2$$ appears in geometry notes.

$$\(\sqrt{3x-1}+(1+x)^2\)$$

$$ \sin(\alpha)^{\theta}=\sum_{i=0}^{n}(x^i + \cos(f))$$

### FlowChart

${FENCE}flow
st=>start: Student asks a question
op=>operation: Socartes analyzes intent
cond=>condition: Need deep workflow?
chat=>operation: Answer with chat capability
solve=>operation: Route to deep solve
e=>end: Return structured response

st->op->cond
cond(no)->chat
cond(yes)->solve
chat->e
solve->e
${FENCE}

### Sequence Diagram

${FENCE}seq
Student->Socartes: Ask for help
Socartes->KnowledgeBase: Load context
Note right of Socartes: Collect memory\nand relevant knowledge
Socartes-->Student: Return guided response
Student->>Socartes: Request rewrite in co-writer
${FENCE}

### End
`;
