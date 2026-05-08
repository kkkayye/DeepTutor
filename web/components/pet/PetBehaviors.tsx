"use client";

import { usePetChatMirror } from "@/hooks/usePetChatMirror";
import { usePetGuideTour } from "@/hooks/usePetGuideTour";
import { usePetMemoryTalk } from "@/hooks/usePetMemoryTalk";
import { usePetWanderer } from "@/hooks/usePetWanderer";

export default function PetBehaviors() {
  usePetWanderer({ enabled: true });
  usePetMemoryTalk({ enabled: true });
  usePetGuideTour({ enabled: true });
  usePetChatMirror();
  return null;
}
