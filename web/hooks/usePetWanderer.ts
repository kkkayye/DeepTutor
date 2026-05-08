"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePet } from "@/context/PetContext";
import type { PetState } from "@/lib/page-agent-types";
import { usePetActivity } from "./usePetActivity";

interface PetPosition {
  x: number;
  y: number;
}

const PET_WIDTH = 192 * 0.62;
const PET_HEIGHT = 244 * 0.62;
const VIEWPORT_MARGIN = 22;
const MIN_TARGET_DISTANCE = 200;
const MIN_DELAY_MS = 8000;
const MAX_DELAY_MS = 22000;

function randomDelay(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampPosition(position: PetPosition): PetPosition {
  if (typeof window === "undefined") return position;
  return {
    x: clamp(
      position.x,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, window.innerWidth - PET_WIDTH - VIEWPORT_MARGIN),
    ),
    y: clamp(
      position.y,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, window.innerHeight - PET_HEIGHT - VIEWPORT_MARGIN),
    ),
  };
}

function pickTarget(current: PetPosition): PetPosition {
  let target = current;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    target = clampPosition({
      x: VIEWPORT_MARGIN + Math.random() * Math.max(1, window.innerWidth - PET_WIDTH),
      y: VIEWPORT_MARGIN + Math.random() * Math.max(1, window.innerHeight - PET_HEIGHT),
    });
    if (Math.hypot(target.x - current.x, target.y - current.y) >= MIN_TARGET_DISTANCE) {
      return target;
    }
  }
  return target;
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

export function usePetWanderer(opts: { enabled: boolean }): void {
  const { position, setPosition, setState, dragging, wanderPaused, agentBusy } =
    usePet();
  const { isUserActive } = usePetActivity();
  const positionRef = useRef(position);
  const draggingRef = useRef(dragging);
  const pausedRef = useRef(wanderPaused);
  const busyRef = useRef(agentBusy);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    draggingRef.current = dragging;
    if (dragging && rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [dragging]);

  useEffect(() => {
    pausedRef.current = wanderPaused;
  }, [wanderPaused]);

  useEffect(() => {
    busyRef.current = agentBusy;
  }, [agentBusy]);

  const clearMotion = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (!opts.enabled) {
      clearMotion();
      return undefined;
    }

    let disposed = false;

    const blocked = () =>
      disposed ||
      pausedRef.current ||
      draggingRef.current ||
      busyRef.current ||
      document.hidden;

    const scheduleNext = (delay = randomDelay()) => {
      if (disposed || pausedRef.current) return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (blocked() || isUserActive()) {
          scheduleNext();
          return;
        }
        walkTo(pickTarget(positionRef.current));
      }, delay);
    };

    const walkTo = (target: PetPosition) => {
      const speed = 1.5 + Math.random() * 1.5;
      let currentWalkingState: PetState = walkingStateForDx(
        target.x - positionRef.current.x,
        "walking",
      );
      setState(currentWalkingState);
      const step = () => {
        if (blocked()) {
          rafRef.current = null;
          scheduleNext();
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
        if (distance <= Math.max(2, speed)) {
          positionRef.current = target;
          setPosition(target);
          setState("idle");
          rafRef.current = null;
          scheduleNext();
          return;
        }
        const next = {
          x: current.x + (dx / distance) * speed,
          y: current.y + (dy / distance) * speed,
        };
        positionRef.current = next;
        setPosition(next);
        rafRef.current = window.requestAnimationFrame(step);
      };
      rafRef.current = window.requestAnimationFrame(step);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearMotion();
      } else {
        scheduleNext(1200);
      }
    };

    scheduleNext(1800);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      clearMotion();
    };
  }, [clearMotion, isUserActive, opts.enabled, setPosition, setState]);
}
