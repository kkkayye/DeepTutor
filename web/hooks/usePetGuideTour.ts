"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePet } from "@/context/PetContext";
import { findPetTarget } from "@/lib/page-agent-dom";
import type { PetState } from "@/lib/page-agent-types";
import {
  PET_GUIDE_REST_DELAY_MS,
  PET_INITIAL_GUIDE_DELAY_MS,
} from "@/lib/pet-script";
import { loadPetShell, savePetShell } from "@/lib/pet-persistence";
import { usePetActivity } from "./usePetActivity";

const TOUR_TARGETS = [
  "chat",
  "agents",
  "co-writer",
  "book",
  "knowledge",
  "space",
] as const;
const PET_WIDTH = 192 * 0.62;
const PET_HEIGHT = 244 * 0.62;
const VIEWPORT_MARGIN = 22;
const TOUR_BUBBLE_MS = 4000;
const TOUR_STEP_MS = 4700;
const WALK_SPEED_PX = 3;

interface PetPosition {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function targetPosition(rect: DOMRect): PetPosition {
  return {
    x: clamp(
      rect.right + 10,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, window.innerWidth - PET_WIDTH - VIEWPORT_MARGIN),
    ),
    y: clamp(
      rect.top + rect.height / 2 - PET_HEIGHT / 2,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, window.innerHeight - PET_HEIGHT - VIEWPORT_MARGIN),
    ),
  };
}

function walkingStateForDx(
  dx: number,
  currentState: PetState,
): "walking" | "walkingLeft" | "walkingRight" {
  if (Math.abs(dx) < 0.5) {
    return currentState === "walkingLeft" || currentState === "walkingRight"
      ? currentState
      : "walking";
  }
  return dx > 0 ? "walkingRight" : "walkingLeft";
}

export function usePetGuideTour(opts: { enabled: boolean }): void {
  const { t } = useTranslation();
  const {
    position,
    setPosition,
    setState,
    say,
    dragging,
    agentBusy,
    dialogOpen,
    wanderPaused,
  } = usePet();
  const { isUserActive } = usePetActivity();

  const indexRef = useRef(0);
  const positionRef = useRef(position);
  const draggingRef = useRef(dragging);
  const agentBusyRef = useRef(agentBusy);
  const dialogOpenRef = useRef(dialogOpen);
  const wanderPausedRef = useRef(wanderPaused);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);
  useEffect(() => {
    agentBusyRef.current = agentBusy;
  }, [agentBusy]);
  useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);
  useEffect(() => {
    wanderPausedRef.current = wanderPaused;
  }, [wanderPaused]);

  useEffect(() => {
    if (!opts.enabled) return undefined;

    let disposed = false;
    let timer: number | null = null;
    let raf: number | null = null;

    const blocked = () =>
      isUserActive() ||
      draggingRef.current ||
      agentBusyRef.current ||
      dialogOpenRef.current ||
      wanderPausedRef.current;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const clearRaf = () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      raf = null;
    };

    const schedule = (delay: number) => {
      clearTimer();
      if (disposed || wanderPausedRef.current) return;
      timer = window.setTimeout(runStep, delay);
    };

    const finishCurrentStep = (targetName: string) => {
      setState("waving");
      say(t(`pet:tour.${targetName}`), TOUR_BUBBLE_MS);
      if (indexRef.current >= TOUR_TARGETS.length) {
        savePetShell({ guideFirstRunDone: true });
      }
      schedule(
        indexRef.current % TOUR_TARGETS.length === 0
          ? PET_GUIDE_REST_DELAY_MS
          : TOUR_STEP_MS,
      );
    };

    const walkTowards = (target: PetPosition, targetName: string) => {
      let currentWalkingState: PetState = walkingStateForDx(
        target.x - positionRef.current.x,
        "walking",
      );
      setState(currentWalkingState);
      const step = () => {
        if (disposed || blocked()) {
          clearRaf();
          finishCurrentStep(targetName);
          return;
        }
        const current = positionRef.current;
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const distance = Math.hypot(dx, dy);
        const nextWalkingState = walkingStateForDx(dx, currentWalkingState);
        if (nextWalkingState !== currentWalkingState) {
          currentWalkingState = nextWalkingState;
          setState(currentWalkingState);
        }
        if (distance <= WALK_SPEED_PX) {
          positionRef.current = target;
          setPosition(target);
          clearRaf();
          finishCurrentStep(targetName);
          return;
        }
        const next = {
          x: current.x + (dx / distance) * WALK_SPEED_PX,
          y: current.y + (dy / distance) * WALK_SPEED_PX,
        };
        positionRef.current = next;
        setPosition(next);
        raf = window.requestAnimationFrame(step);
      };
      raf = window.requestAnimationFrame(step);
    };

    const runStep = () => {
      timer = null;
      if (disposed) return;
      if (blocked()) {
        schedule(PET_GUIDE_REST_DELAY_MS);
        return;
      }
      const targetName = TOUR_TARGETS[indexRef.current % TOUR_TARGETS.length];
      indexRef.current += 1;
      const el = findPetTarget(targetName);
      if (!el) {
        finishCurrentStep(targetName);
        return;
      }
      const rect = el.getBoundingClientRect();
      walkTowards(targetPosition(rect), targetName);
    };

    const shell = loadPetShell();
    indexRef.current = shell.guideFirstRunDone ? 0 : indexRef.current;
    schedule(
      shell.guideFirstRunDone
        ? PET_GUIDE_REST_DELAY_MS
        : PET_INITIAL_GUIDE_DELAY_MS,
    );

    return () => {
      disposed = true;
      clearTimer();
      clearRaf();
    };
  }, [isUserActive, opts.enabled, say, setPosition, setState, t]);
}
