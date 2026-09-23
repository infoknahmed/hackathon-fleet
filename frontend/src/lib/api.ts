/**
 * Backend API base URL resolution.
 *
 * Priority:
 *   1. VITE_API_URL build-time env var (set when building for production,
 *      e.g. `VITE_API_URL=https://vaaksetu-api.onrender.com npm run build`).
 *   2. Same-origin (`""`) — used in dev via the Vite proxy and when the
 *      Express backend serves the built frontend itself.
 *
 * Never hardcode localhost here: the production bundle must point at the
 * deployed backend or every realtime/persistence feature silently dies.
 */

function resolveBaseUrl(): string {
  const envUrl = (import.meta.env?.VITE_API_URL as string | undefined)?.trim()
  if (envUrl) return envUrl.replace(/\/+$/, "")
  // Same-origin: dev proxy (vite.config.js) or backend-served static build.
  return ""
}

export const API_BASE = resolveBaseUrl()

/** True when a backend URL is actually configured (not same-origin guess). */
export function hasConfiguredBackend(): boolean {
  return API_BASE !== ""
}

/** REST helper with JSON + timeout + friendly errors. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Absolute URL for the socket connection (undefined = same-origin). */
export const SOCKET_URL = API_BASE === "" ? undefined : API_BASE
