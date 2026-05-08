import { apiUrl } from "./api";
import {
  AgentAction,
  AgentChatMessage,
  AgentToolCall,
  parseAgentAction,
} from "./page-agent-types";
import {
  PET_AGENT_MAX_MESSAGE_CHARS,
  PET_AGENT_MAX_MESSAGES,
} from "./pet-script";

type JsonSchema = Record<string, unknown>;

interface AgentChoiceMessage {
  role?: unknown;
  content?: unknown;
  tool_calls?: unknown;
}

interface AgentResponse {
  choices?: Array<{ message?: AgentChoiceMessage }>;
}

const AGENT_OUTPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["type"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["click", "input_text", "open_section", "wait", "done"],
    },
    target: { type: "string" },
    text: { type: "string" },
    section: { type: "string" },
    ms: { type: "number" },
    message: { type: "string" },
  },
};

function contentLength(messages: AgentChatMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function trimMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  const trimmed = messages.slice(-PET_AGENT_MAX_MESSAGES).map((message) => ({
    ...message,
  }));

  while (
    contentLength(trimmed) > PET_AGENT_MAX_MESSAGE_CHARS &&
    trimmed.length > 1
  ) {
    const index = trimmed.findIndex((message) => message.role !== "system");
    if (index === -1) break;
    trimmed.splice(index, 1);
  }

  let total = contentLength(trimmed);
  if (total <= PET_AGENT_MAX_MESSAGE_CHARS) return trimmed;

  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index].role === "system") continue;
    const overflow = total - PET_AGENT_MAX_MESSAGE_CHARS;
    if (overflow <= 0) break;
    const content = trimmed[index].content;
    trimmed[index].content = content.slice(Math.min(overflow, content.length));
    total = contentLength(trimmed);
  }

  if (total <= PET_AGENT_MAX_MESSAGE_CHARS) return trimmed;
  return trimmed.map((message, index) =>
    index === trimmed.length - 1
      ? {
          ...message,
          content: message.content.slice(-PET_AGENT_MAX_MESSAGE_CHARS),
        }
      : { ...message, content: "" },
  );
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (body.detail) return String(body.detail);
  } catch {
    // Response is not JSON.
  }
  return response.statusText;
}

function normalizeToolCalls(value: unknown): AgentToolCall[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const calls = value.filter((item): item is AgentToolCall => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    const fn = record.function;
    return (
      typeof record.id === "string" &&
      record.type === "function" &&
      fn !== null &&
      typeof fn === "object" &&
      (fn as Record<string, unknown>).name === "AgentOutput" &&
      typeof (fn as Record<string, unknown>).arguments === "string"
    );
  });
  return calls.length > 0 ? calls : undefined;
}

function normalizeAssistant(message: AgentChoiceMessage): AgentChatMessage {
  return {
    role: "assistant",
    content: typeof message.content === "string" ? message.content : "",
    tool_calls: normalizeToolCalls(message.tool_calls),
  };
}

export async function runPageAgentTurn(
  messages: AgentChatMessage[],
  opts?: { signal?: AbortSignal },
): Promise<{ assistant: AgentChatMessage; action: AgentAction | null }> {
  const response = await fetch(
    apiUrl("/api/v1/page-agent/openai/v1/chat/completions"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts?.signal,
      body: JSON.stringify({
        messages: trimMessages(messages),
        tools: [
          {
            type: "function",
            function: {
              name: "AgentOutput",
              description: "Return one page action for the agent to execute.",
              parameters: AGENT_OUTPUT_SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "AgentOutput" } },
        temperature: 0.7,
      }),
    },
  );

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`Page agent request failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as AgentResponse;
  const assistant = normalizeAssistant(data.choices?.[0]?.message ?? {});
  const args = assistant.tool_calls?.[0]?.function.arguments;
  return {
    assistant,
    action: args ? parseAgentAction(args) : null,
  };
}
