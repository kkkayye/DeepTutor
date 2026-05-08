"use client";

import { useMemo } from "react";
import {
  useUnifiedChat,
  type MessageItem,
} from "@/context/UnifiedChatContext";

interface PetChatBridge {
  busy: boolean;
  messages: MessageItem[];
  sessionError: string | null;
}

export function usePetChatBridge(): PetChatBridge {
  const { state } = useUnifiedChat();

  return useMemo(
    () => ({
      busy: state.isStreaming,
      messages: state.messages,
      sessionError: null,
    }),
    [state.isStreaming, state.messages],
  );
}
