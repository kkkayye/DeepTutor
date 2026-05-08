"use client";

import { useEffect, useRef } from "react";
import { usePet } from "@/context/PetContext";
import { usePetChatBridge } from "@/hooks/usePetChatBridge";

export function usePetChatMirror(): void {
  const { busy, messages, sessionError } = usePetChatBridge();
  const { setState } = usePet();
  const wasBusyRef = useRef(busy);

  useEffect(() => {
    let timer: number | null = null;
    const wasBusy = wasBusyRef.current;
    const lastMessage = messages[messages.length - 1];

    if (sessionError) {
      setState("confused");
      timer = window.setTimeout(() => setState("idle"), 3000);
    } else if (busy) {
      setState("review");
    } else if (wasBusy && lastMessage?.role === "assistant") {
      setState("happy");
      timer = window.setTimeout(() => setState("idle"), 1500);
    }

    wasBusyRef.current = busy;
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [busy, messages, sessionError, setState]);
}
