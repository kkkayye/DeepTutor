import type { AgentAction } from "./page-agent-types";

function escapeSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none";
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.min(5000, ms)));
  });
}

function clickElement(element: HTMLElement): void {
  element.scrollIntoView({ block: "center" });
  element.click();
}

export function findPetTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-pet-target="${escapeSelector(target)}"]`,
  );
}

export function listVisiblePetTargets(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-pet-target]"))
    .filter(isVisible)
    .map((element) => element.dataset.petTarget)
    .filter((target): target is string => Boolean(target));
}

export async function executeAgentAction(
  action: AgentAction,
): Promise<{ ok: boolean; detail: string }> {
  switch (action.type) {
    case "click": {
      const element = findPetTarget(action.target);
      if (!element) return { ok: false, detail: "target not found" };
      clickElement(element);
      return { ok: true, detail: action.target };
    }
    case "input_text": {
      const element = findPetTarget(action.target);
      if (!element) return { ok: false, detail: "target not found" };
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        )
      ) {
        return { ok: false, detail: "target is not text input" };
      }
      element.scrollIntoView({ block: "center" });
      element.focus();
      setNativeValue(element, action.text);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, detail: action.target };
    }
    case "open_section": {
      const section = document.querySelector<HTMLElement>(
        `[data-pet-section="${escapeSelector(action.section)}"]`,
      );
      const element = section ?? findPetTarget(action.section);
      if (!element) return { ok: false, detail: "target not found" };
      clickElement(element);
      return { ok: true, detail: action.section };
    }
    case "wait":
      await wait(action.ms);
      return { ok: true, detail: String(Math.max(0, Math.min(5000, action.ms))) };
    case "done":
      return { ok: true, detail: action.message };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
