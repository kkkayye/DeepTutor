const PET_SHELL_STORAGE_KEY = "socartes.pet.shell.v1";

export interface PetShell {
  position?: { x: number; y: number };
  wanderPaused?: boolean;
  guideFirstRunDone?: boolean;
}

function isStorage(value: unknown): value is Storage {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Storage).getItem === "function" &&
    typeof (value as Storage).setItem === "function"
  );
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && isStorage(window.localStorage)) {
      return window.localStorage;
    }
  } catch {
    // Browser storage can throw when disabled.
  }
  try {
    const storage = (globalThis as { localStorage?: unknown }).localStorage;
    return isStorage(storage) ? storage : null;
  } catch {
    return null;
  }
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.x === "number" &&
    Number.isFinite(record.x) &&
    typeof record.y === "number" &&
    Number.isFinite(record.y)
  );
}

export function loadPetShell(): PetShell {
  const storage = getLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(PET_SHELL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    return {
      ...(isFinitePosition(record.position)
        ? { position: record.position }
        : {}),
      ...(typeof record.wanderPaused === "boolean"
        ? { wanderPaused: record.wanderPaused }
        : {}),
      ...(typeof record.guideFirstRunDone === "boolean"
        ? { guideFirstRunDone: record.guideFirstRunDone }
        : {}),
    };
  } catch {
    return {};
  }
}

export function savePetShell(patch: Partial<PetShell>): void {
  const storage = getLocalStorage();
  if (!storage) return;
  const next: PetShell = { ...loadPetShell(), ...patch };
  try {
    storage.setItem(PET_SHELL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or disabled storage.
  }
}
