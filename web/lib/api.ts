// API configuration and utility functions.
//
// Browser code uses same-origin paths such as `/api/v1/chat`. The real backend
// address stays server-side behind Next rewrites or a reverse proxy.

const DEFAULT_BACKEND_PORT = process.env.BACKEND_PORT || "8001";

export const API_BASE_URL = (
  process.env.INTERNAL_API_BASE ||
  process.env.API_INTERNAL_BASE ||
  `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`
).replace(/\/+$/, "");

/**
 * Resolve the API base used by JavaScript callers.
 * In the browser this is always same-origin; on the server it is the private
 * internal backend URL.
 */
export function resolveBase(): string {
  if (typeof window !== "undefined") return "";
  return API_BASE_URL;
}

/**
 * Construct an API URL from a path
 * @param path - API path (e.g., '/api/v1/knowledge/list')
 * @returns Same-origin URL in browsers, private absolute URL on the server.
 */
export function apiUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const base = resolveBase();
  if (!base) return normalizedPath;

  // Remove trailing slash from base URL if present
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;

  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Construct a WebSocket URL from a path
 * @param path - WebSocket path (e.g., '/api/v1/solve')
 * @returns WebSocket URL (e.g., 'wss://sc.tckr.top/api/v1/ws')
 */
export function wsUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${normalizedPath}`;
  }

  const base = resolveBase()
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");

  // Remove trailing slash from base URL if present
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;

  return `${normalizedBase}${normalizedPath}`;
}

const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

/**
 * Authenticated fetch wrapper. Behaves identically to `fetch` but automatically
 * redirects to /login when the backend returns 401 (expired / invalid token).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, { credentials: "include", ...init });

  if (res.status === 401 && AUTH_ENABLED && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
    return new Promise(() => {});
  }

  return res;
}
