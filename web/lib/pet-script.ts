import type { PetState } from "./page-agent-types";

export const PET_STATES: Record<
  PetState,
  { row: number; frames: number; durationMs: number }
> = {
  idle: { row: 0, frames: 6, durationMs: 1100 },
  walking: { row: 7, frames: 6, durationMs: 820 },
  walkingRight: { row: 1, frames: 8, durationMs: 1060 },
  walkingLeft: { row: 2, frames: 8, durationMs: 1060 },
  waving: { row: 3, frames: 4, durationMs: 700 },
  review: { row: 8, frames: 6, durationMs: 1030 },
  waiting: { row: 6, frames: 6, durationMs: 1010 },
  thinking: { row: 6, frames: 6, durationMs: 1200 },
  happy: { row: 4, frames: 5, durationMs: 840 },
  confused: { row: 5, frames: 8, durationMs: 1220 },
};

export const PET_INITIAL_GUIDE_DELAY_MS = 26000;
export const PET_GUIDE_REST_DELAY_MS = 62000;
export const PET_MEMORY_TALK_DELAY_MS = 36000;
export const PET_USER_ACTIVE_SUPPRESS_MS = 60000;
export const PET_AGENT_LLM_TIMEOUT_MS = 8000;
export const PET_AGENT_MAX_STEPS = 8;
export const PET_BUBBLE_DEFAULT_MS = 3600;

export const PET_AGENT_MAX_MESSAGES = 12;
export const PET_AGENT_MAX_MESSAGE_CHARS = 60000;

export const PET_KNOWLEDGE_PREFIXES = [
  "pet:memoryPrefix.0",
  "pet:memoryPrefix.1",
  "pet:memoryPrefix.2",
] as const;
