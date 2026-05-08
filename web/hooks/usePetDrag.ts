"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePet } from "@/context/PetContext";

const VIEWPORT_MARGIN = 16;

interface PetPosition {
  x: number;
  y: number;
}

function clampPosition(
  position: PetPosition,
  element: HTMLElement | null,
): PetPosition {
  if (typeof window === "undefined") return position;
  const rect = element?.getBoundingClientRect();
  const width = rect?.width ?? 0;
  const height = rect?.height ?? 0;
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(position.x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(position.y, VIEWPORT_MARGIN), maxY),
  };
}

export function usePetDrag(elementRef: RefObject<HTMLElement | null>): void {
  const { position, setDragging, setPosition, setState } = usePet();
  const positionRef = useRef(position);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    let activePointerId: number | null = null;
    let offsetX = 0;
    let offsetY = 0;

    const moveTo = (clientX: number, clientY: number) => {
      const next = clampPosition(
        { x: clientX - offsetX, y: clientY - offsetY },
        element,
      );
      positionRef.current = next;
      setPosition(next);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      event.preventDefault();
      moveTo(event.clientX, event.clientY);
    };

    const finishDrag = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      activePointerId = null;
      setDragging(false);
      setState("idle");
      setPosition(positionRef.current);
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        // The browser may release capture first when the pointer is canceled.
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      activePointerId = event.pointerId;
      offsetX = event.clientX - positionRef.current.x;
      offsetY = event.clientY - positionRef.current.y;
      setDragging(true);
      setState("waving");
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best effort; window listeners still keep dragging working.
      }
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishDrag);
      window.addEventListener("pointercancel", finishDrag);
    };

    element.addEventListener("pointerdown", handlePointerDown);
    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [elementRef, setDragging, setPosition, setState]);

  useEffect(() => {
    const handleResize = () => {
      const next = clampPosition(positionRef.current, elementRef.current);
      if (next.x === positionRef.current.x && next.y === positionRef.current.y) {
        return;
      }
      positionRef.current = next;
      setPosition(next);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [elementRef, setPosition]);
}
