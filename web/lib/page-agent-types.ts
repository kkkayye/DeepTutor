export type AgentActionType =
  | "click"
  | "input_text"
  | "open_section"
  | "wait"
  | "done";

export type AgentAction =
  | { type: "click"; target: string; message?: string }
  | { type: "input_text"; target: string; text: string; message?: string }
  | { type: "open_section"; section: string; message?: string }
  | { type: "wait"; ms: number; message?: string }
  | { type: "done"; message: string };

export type PetState =
  | "idle"
  | "walking"
  | "walkingLeft"
  | "walkingRight"
  | "waving"
  | "review"
  | "waiting"
  | "thinking"
  | "happy"
  | "confused";

export interface AgentToolCall {
  id: string;
  type: "function";
  function: {
    name: "AgentOutput";
    arguments: string;
  };
}

export interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: AgentToolCall[];
  name?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalMessage(value: unknown): { message?: string } | null {
  if (value === undefined) return {};
  return typeof value === "string" ? { message: value } : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseAgentAction(rawArgs: string): AgentAction | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
  const message = optionalMessage(parsed.message);
  if (!message) return null;

  switch (parsed.type) {
    case "click": {
      const target = requiredString(parsed.target);
      return target ? { type: "click", target, ...message } : null;
    }
    case "input_text": {
      const target = requiredString(parsed.target);
      const text = typeof parsed.text === "string" ? parsed.text : null;
      return target && text !== null
        ? { type: "input_text", target, text, ...message }
        : null;
    }
    case "open_section": {
      const section = requiredString(parsed.section);
      return section ? { type: "open_section", section, ...message } : null;
    }
    case "wait":
      return typeof parsed.ms === "number" && Number.isFinite(parsed.ms)
        ? { type: "wait", ms: parsed.ms, ...message }
        : null;
    case "done": {
      const doneMessage = requiredString(parsed.message);
      return doneMessage ? { type: "done", message: doneMessage } : null;
    }
    default:
      return null;
  }
}
