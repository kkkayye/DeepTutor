"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AgentChatMessage, PetState } from "@/lib/page-agent-types";
import {
  PET_AGENT_MAX_MESSAGES,
  PET_BUBBLE_DEFAULT_MS,
} from "@/lib/pet-script";
import { loadPetShell, savePetShell } from "@/lib/pet-persistence";

interface PetPosition {
  x: number;
  y: number;
}

interface PetBubble {
  text: string;
  until: number;
}

interface PetContextValue {
  position: PetPosition;
  setPosition: (next: PetPosition) => void;
  state: PetState;
  setState: (next: PetState) => void;
  bubble: PetBubble | null;
  say: (text: string, durationMs?: number) => void;
  clearBubble: () => void;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  wanderPaused: boolean;
  setWanderPaused: (paused: boolean) => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  agentBusy: boolean;
  setAgentBusy: (busy: boolean) => void;
  history: AgentChatMessage[];
  pushHistory: (message: AgentChatMessage) => void;
  resetHistory: () => void;
}

const PetContext = createContext<PetContextValue | null>(null);

function defaultPosition(): PetPosition {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: Math.max(0, window.innerWidth - 210),
    y: Math.max(0, window.innerHeight - 270),
  };
}

function initialPosition(): PetPosition {
  return loadPetShell().position ?? defaultPosition();
}

function initialWanderPaused(): boolean {
  return loadPetShell().wanderPaused ?? false;
}

function trimHistory(messages: AgentChatMessage[]): AgentChatMessage[] {
  if (messages.length <= PET_AGENT_MAX_MESSAGES) return messages;
  const next = messages.slice();
  while (next.length > PET_AGENT_MAX_MESSAGES) {
    const index = next.findIndex((message) => message.role !== "system");
    if (index === -1) break;
    next.splice(index, 1);
  }
  return next.length > PET_AGENT_MAX_MESSAGES
    ? next.slice(next.length - PET_AGENT_MAX_MESSAGES)
    : next;
}

export function PetProvider({ children }: { children: ReactNode }) {
  const [position, setPositionState] = useState<PetPosition>(initialPosition);
  const [state, setState] = useState<PetState>("idle");
  const [bubble, setBubble] = useState<PetBubble | null>(null);
  const [dragging, setDragging] = useState(false);
  const [wanderPaused, setWanderPausedState] =
    useState<boolean>(initialWanderPaused);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [history, setHistory] = useState<AgentChatMessage[]>([]);
  const savePositionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (savePositionTimerRef.current !== null) {
        window.clearTimeout(savePositionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!bubble) return undefined;
    const delay = Math.max(0, bubble.until - Date.now());
    const timer = window.setTimeout(() => {
      setBubble((current) => (current?.until === bubble.until ? null : current));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  const setPosition = useCallback((next: PetPosition) => {
    setPositionState(next);
    if (savePositionTimerRef.current !== null) {
      window.clearTimeout(savePositionTimerRef.current);
    }
    savePositionTimerRef.current = window.setTimeout(() => {
      savePetShell({ position: next });
      savePositionTimerRef.current = null;
    }, 200);
  }, []);

  const say = useCallback((text: string, durationMs = PET_BUBBLE_DEFAULT_MS) => {
    setBubble({ text, until: Date.now() + durationMs });
  }, []);

  const clearBubble = useCallback(() => {
    setBubble(null);
  }, []);

  const setWanderPaused = useCallback((paused: boolean) => {
    setWanderPausedState(paused);
    savePetShell({ wanderPaused: paused });
  }, []);

  const pushHistory = useCallback((message: AgentChatMessage) => {
    setHistory((prev) => trimHistory([...prev, message]));
  }, []);

  const resetHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const value = useMemo<PetContextValue>(
    () => ({
      position,
      setPosition,
      state,
      setState,
      bubble,
      say,
      clearBubble,
      dragging,
      setDragging,
      wanderPaused,
      setWanderPaused,
      dialogOpen,
      setDialogOpen,
      agentBusy,
      setAgentBusy,
      history,
      pushHistory,
      resetHistory,
    }),
    [
      position,
      setPosition,
      state,
      bubble,
      say,
      clearBubble,
      dragging,
      wanderPaused,
      setWanderPaused,
      dialogOpen,
      agentBusy,
      history,
      pushHistory,
      resetHistory,
    ],
  );

  return <PetContext.Provider value={value}>{children}</PetContext.Provider>;
}

export function usePet(): PetContextValue {
  const ctx = useContext(PetContext);
  if (!ctx) {
    throw new Error("usePet must be used inside <PetProvider>");
  }
  return ctx;
}
