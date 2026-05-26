import test from "node:test";
import assert from "node:assert/strict";

// Must be set before importing the module under test, since API_BASE_URL is
// read at module-load time.
process.env.INTERNAL_API_BASE = "http://127.0.0.1:8001";

let apiModulePromise: Promise<typeof import("../lib/api")> | null = null;

async function loadApiModule(): Promise<typeof import("../lib/api")> {
  apiModulePromise ??= import("../lib/api");
  return apiModulePromise;
}

function setWindow(location?: {
  hostname: string;
  host: string;
  protocol: "http:" | "https:";
}): void {
  if (location === undefined) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  (globalThis as { window?: unknown }).window = {
    location,
  } as unknown;
}

test("resolveBase returns the internal backend base in SSR (no window)", async () => {
  const { resolveBase } = await loadApiModule();
  setWindow(undefined);
  assert.equal(resolveBase(), "http://127.0.0.1:8001");
});

test("resolveBase returns same-origin mode in the browser", async () => {
  const { resolveBase } = await loadApiModule();
  setWindow({
    hostname: "localhost",
    host: "localhost:3000",
    protocol: "http:",
  });
  assert.equal(resolveBase(), "");
});

test("apiUrl composes a private absolute URL during SSR", async () => {
  const { apiUrl } = await loadApiModule();
  setWindow(undefined);
  assert.equal(
    apiUrl("/api/v1/knowledge/list"),
    "http://127.0.0.1:8001/api/v1/knowledge/list",
  );
});

test("apiUrl keeps browser requests same-origin", async () => {
  const { apiUrl } = await loadApiModule();
  setWindow({
    hostname: "10.0.0.5",
    host: "10.0.0.5:3000",
    protocol: "http:",
  });
  assert.equal(
    apiUrl("/api/v1/knowledge/list"),
    "/api/v1/knowledge/list",
  );
});

test("wsUrl converts the internal SSR base from http to ws", async () => {
  const { wsUrl } = await loadApiModule();
  setWindow(undefined);
  assert.equal(wsUrl("/api/v1/ws"), "ws://127.0.0.1:8001/api/v1/ws");
});

test("wsUrl uses the current browser origin and upgrades https to wss", async () => {
  const { wsUrl } = await loadApiModule();
  setWindow({
    hostname: "sc.tckr.top",
    host: "sc.tckr.top",
    protocol: "https:",
  });
  assert.equal(wsUrl("/api/v1/ws"), "wss://sc.tckr.top/api/v1/ws");
});
