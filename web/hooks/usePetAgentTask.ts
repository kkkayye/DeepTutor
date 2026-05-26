"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePet } from "@/context/PetContext";
import { executeAgentAction, listVisiblePetTargets } from "@/lib/page-agent-dom";
import type {
  AgentAction,
  AgentChatMessage,
} from "@/lib/page-agent-types";
import { runPageAgentTurn } from "@/lib/page-agent-api";
import { PET_AGENT_MAX_STEPS } from "@/lib/pet-script";
import { buildPetSystemPrompt } from "@/lib/pet-system-prompt";

export interface PetAgentTaskHandle {
  run: (userInput: string) => Promise<void>;
  cancel: () => void;
  busy: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  );
}

function agentLanguage(language: string): "zh" | "en" | "ko" {
  if (language.startsWith("zh")) return "zh";
  if (language.startsWith("ko")) return "ko";
  return "en";
}

function listVisiblePetSections(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-pet-section]"))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none";
    })
    .map((element) => element.dataset.petSection)
    .filter((section): section is string => Boolean(section));
}

function actionLabel(action: AgentAction): string {
  switch (action.type) {
    case "click":
      return `click ${action.target}`;
    case "input_text":
      return `input_text ${action.target}`;
    case "open_section":
      return `open_section ${action.section}`;
    case "wait":
      return `wait ${action.ms}`;
    case "done":
      return "done";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function actionFailed(action: AgentAction, ok: boolean): boolean {
  return !ok && (action.type === "click" || action.type === "input_text");
}

export function usePetAgentTask(): PetAgentTaskHandle {
  const { t, i18n } = useTranslation();
  const {
    agentBusy,
    history,
    pushHistory,
    say,
    setAgentBusy,
    setState,
  } = usePet();
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setAgentBusy(false);
    setState("idle");
  }, [setAgentBusy, setState]);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    async (userInput: string) => {
      const trimmedInput = userInput.trim();
      if (!trimmedInput || agentBusy) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      const signal = controller.signal;
      const userMessage: AgentChatMessage = {
        role: "user",
        content: trimmedInput,
      };
      let conversation = [...history, userMessage];
      let finished = false;

      setAgentBusy(true);
      setState("thinking");
      pushHistory(userMessage);

      try {
        for (let step = 0; step < PET_AGENT_MAX_STEPS; step += 1) {
          if (signal.aborted) break;
          await sleep(100);
          if (signal.aborted) break;

          const visibleTargets = listVisiblePetTargets();
          const visibleSections = listVisiblePetSections();
          const systemMessage: AgentChatMessage = {
            role: "system",
            content: buildPetSystemPrompt({
              language: agentLanguage(i18n.language),
              visibleTargets,
              visibleSections,
            }),
          };
          const { assistant, action } = await runPageAgentTurn(
            [systemMessage, ...conversation],
            { signal },
          );

          conversation = [...conversation, assistant];
          pushHistory(assistant);

          if (!action) {
            setState("confused");
            say(t("pet:error.noAction"));
            finished = true;
            break;
          }

          if (action.message) {
            say(action.message);
          }

          if (action.type === "done") {
            say(action.message, 4500);
            setState("happy");
            finished = true;
            break;
          }

          setState("review");
          const toolCallId =
            assistant.tool_calls?.[0]?.id ?? `pet-agent-step-${step}`;
          const result = await executeAgentAction(action);
          const toolMessage: AgentChatMessage = {
            role: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify({
              action: actionLabel(action),
              ...result,
            }),
          };
          conversation = [...conversation, toolMessage];
          pushHistory(toolMessage);

          if (actionFailed(action, result.ok)) {
            setState("confused");
            say(t("pet:error.actionFailed"));
          } else {
            setState("thinking");
          }
        }

        if (!finished && !signal.aborted) {
          setState("confused");
          say(t("pet:error.maxSteps"));
          finished = true;
        }
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        setState("confused");
        say(t("pet:error.requestFailed"));
        finished = true;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setAgentBusy(false);
        if (!finished) {
          setState("idle");
        }
      }
    },
    [
      agentBusy,
      history,
      i18n.language,
      pushHistory,
      say,
      setAgentBusy,
      setState,
      t,
    ],
  );

  return { run, cancel, busy: agentBusy };
}
