"use client";

import { useCallback, useEffect, useRef } from "react";
import { PET_USER_ACTIVE_SUPPRESS_MS } from "@/lib/pet-script";

export function usePetActivity(): {
  isUserActive: () => boolean;
  lastActivityAt: () => number;
} {
  const lastUserActivityAtRef = useRef(0);

  useEffect(() => {
    const markActive = () => {
      lastUserActivityAtRef.current = Date.now();
    };
    document.addEventListener("pointermove", markActive, { passive: true });
    document.addEventListener("keydown", markActive);
    return () => {
      document.removeEventListener("pointermove", markActive);
      document.removeEventListener("keydown", markActive);
    };
  }, []);

  const isUserActive = useCallback(
    () => Date.now() - lastUserActivityAtRef.current < PET_USER_ACTIVE_SUPPRESS_MS,
    [],
  );
  const lastActivityAt = useCallback(() => lastUserActivityAtRef.current, []);

  return { isUserActive, lastActivityAt };
}
