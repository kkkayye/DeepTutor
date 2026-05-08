"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePet } from "@/context/PetContext";
import {
  PET_KNOWLEDGE_PREFIXES,
  PET_MEMORY_TALK_DELAY_MS,
} from "@/lib/pet-script";
import { usePetActivity } from "./usePetActivity";

const MEMORY_LINE_COUNT = 8;
const MEMORY_BUBBLE_MS = 4200;

function randomIndex(max: number): number {
  return Math.floor(Math.random() * max);
}

export function usePetMemoryTalk(opts: { enabled: boolean }): void {
  const { t } = useTranslation();
  const { say, dragging, agentBusy, dialogOpen, wanderPaused } = usePet();
  const { isUserActive } = usePetActivity();

  useEffect(() => {
    if (!opts.enabled) return undefined;

    const timer = window.setInterval(() => {
      if (
        isUserActive() ||
        dragging ||
        agentBusy ||
        dialogOpen ||
        wanderPaused
      ) {
        return;
      }
      const prefixKey = PET_KNOWLEDGE_PREFIXES[randomIndex(PET_KNOWLEDGE_PREFIXES.length)];
      const lineKey = `pet:memoryLine.${randomIndex(MEMORY_LINE_COUNT)}`;
      say(`${t(prefixKey)}: ${t(lineKey)}`, MEMORY_BUBBLE_MS);
    }, PET_MEMORY_TALK_DELAY_MS);

    return () => window.clearInterval(timer);
  }, [
    agentBusy,
    dialogOpen,
    dragging,
    isUserActive,
    opts.enabled,
    say,
    t,
    wanderPaused,
  ]);
}
