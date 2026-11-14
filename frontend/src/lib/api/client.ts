/**
 * Core API transport for the DEAL backend (NestJS, global prefix /api/v1).
 *
 * Every backend response is wrapped by the API envelope:
 *   success → { success: true, data: <payload> }
 *   failure → { success: false, error: { code, message } }
 * This client unwraps it, attaches the bearer token, and transparently
 * refreshes an expired access token (single-flight) before retrying once.
 *
 * Base URL resolution:
 * - Empty/unset NEXT_PUBLIC_API_URL uses same-origin "/api/v1", which Next
 *   proxies to the server-only DEAL_API_ORIGIN. This is the preferred cookie-
 *   safe deployment model.
 * - NEXT_PUBLIC_API_URL is an optional direct browser-to-API override.
 * - NEXT_PUBLIC_API_PORT — sandbox-only: when set, every request appends
 *   `XTransformPort=<port>` so the preview gateway forwards it to the backend
 *   port. Leave unset in production.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const API_PORT = process.env.NEXT_PUBLIC_API_PORT;
const SAME_ORIGIN_API_BASE_URL = "/api/v1";
const READINESS_CACHE_MS = 30_000;
const TRANSIENT_UPSTREAM_STATUSES = new Set([502, 503, 504]);

export type ApiErrorCode = string;

/** Typed error carrying the backend's machine-readable error code. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

/* ---- token plumbing (injected by session.ts to avoid a circular import) ---- */

let readAccessToken: () => string | null = () => null;
let readLegacyRefreshToken: () => string | null = () => null;
let persistAccessToken: (access: string) => void = () => undefined;
let dropSession: () => void = () => undefined;

/** session.ts registers its storage-backed callbacks at import time. */
export function bindTokenStore(store: {
  getAccessToken: () => string | null;
  getLegacyRefreshToken: () => string | null;
  saveAccessToken: (access: string) => void;
  clearSession: () => void;
}): void {
  readAccessToken = store.getAccessToken;
  readLegacyRefreshToken = store.getLegacyRefreshToken;
  persistAccessToken = store.saveAccessToken;
  dropSession = store.clearSession;
}

/* ---- refresh single-flight: parallel 401s share ONE refresh call ---- */

let refreshInFlight: Promise<boolean> | null = null;
let readinessInFlight: Promise<void> | null = null;
let lastReadyAt = 0;

async function probeApiReadiness(): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/health", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Can't reach DEAL right now. Check your connection.", 0);
  }

  const body = (await response.json().catch(() => null)) as ErrorEnvelope | null;
  if (!response.ok) {
    throw new ApiError(
      body?.error.code ?? "SERVICE_UNAVAILABLE",
      body?.error.message ?? "DEAL is unavailable right now. Please try again in a moment.",
      response.status,
    );
  }

  lastReadyAt = Date.now();
}

/**
 * Same-origin deployments use a server-side readiness gate to wake a sleeping
 * API before sending credentials or other mutation bodies. The short cache
 * avoids adding a health request to every API call during normal use.
 */
async function ensureApiReady(): Promise<void> {
  if (API_BASE_URL !== SAME_ORIGIN_API_BASE_URL) return;
  if (Date.now() - lastReadyAt < READINESS_CACHE_MS) return;

  if (!readinessInFlight) {
    readinessInFlight = probeApiReadiness().finally(() => {
      readinessInFlight = null;
    });
  }
  await readinessInFlight;
}

async function refreshSession(): Promise<boolean> {
  const legacyRefreshToken = readLegacyRefreshToken();

  const res = await fetch(`${API_BASE_URL}/auth/refresh${portQuery()}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    // Old sessions can migrate once by presenting their localStorage token;
    // new sessions authenticate exclusively through the HttpOnly cookie.
    body: JSON.stringify(legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}),
  });
  if (!res.ok) return false;
  const payload = (await res.json().catch(() => null)) as
    | { data?: { accessToken: string } }
    | null;
  if (!payload?.data?.accessToken) return false;
  persistAccessToken(payload.data.accessToken);
  return true;
}

async function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function portQuery(): string {
  return API_PORT ? `?XTransformPort=${encodeURIComponent(API_PORT)}` : "";
}

/** URL for raw (non-envelope) API responses such as protected image bytes. */
export function rawApiUrl(path: string): string {
  return `${API_BASE_URL}${path}${portQuery()}`;
}

/* ---- core request ---- */

async function requestOnce<T>(path: string, init: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = readAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}${portQuery()}`, {
      ...init,
      headers,
      // Required when the API is hosted on a different origin; the refresh
      // cookie remains constrained by Secure + SameSite + its auth-only path.
      credentials: "include",
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Can't reach DEAL right now. Check your connection.", 0);
  }

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | ErrorEnvelope
    | null;

  if (res.ok && body && body.success) return body.data;

  const error = body && !body.success ? body.error : undefined;
  if (TRANSIENT_UPSTREAM_STATUSES.has(res.status)) {
    lastReadyAt = 0;
  }
  throw new ApiError(
    error?.code ?? `HTTP_${res.status}`,
    error?.message ??
      (TRANSIENT_UPSTREAM_STATUSES.has(res.status)
        ? "DEAL is temporarily unavailable. Please try again in a moment."
        : "Something went wrong. Please try again."),
    res.status,
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  await ensureApiReady();
  try {
    return await requestOnce<T>(path, init);
  } catch (err) {
    // Access tokens live 15 minutes; an expired one is the normal trigger for
    // a silent refresh + retry. Any other failure is surfaced as-is.
    const isExpired =
      err instanceof ApiError &&
      err.status === 401 &&
      err.code === "TOKEN_EXPIRED" &&
      path !== "/auth/refresh";
    if (!isExpired) throw err;
    const refreshed = await refreshOnce();
    if (!refreshed) {
      // Refresh token dead/rotated-out (or reuse detected) — the session is over.
      dropSession();
      throw err;
    }
    return requestOnce<T>(path, init);
  }
}

export const transport = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
};
