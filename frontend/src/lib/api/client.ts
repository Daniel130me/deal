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
 * - NEXT_PUBLIC_API_URL  — absolute backend origin in production
 *   (e.g. https://api.deal.ng/api/v1). Empty/unset = same-origin "/api/v1".
 * - NEXT_PUBLIC_API_PORT — sandbox-only: when set, every request appends
 *   `XTransformPort=<port>` so the preview gateway forwards it to the backend
 *   port. Leave unset in production.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const API_PORT = process.env.NEXT_PUBLIC_API_PORT;

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
let readRefreshToken: () => string | null = () => null;
let persistTokens: (access: string, refresh: string) => void = () => undefined;
let dropSession: () => void = () => undefined;

/** session.ts registers its storage-backed callbacks at import time. */
export function bindTokenStore(store: {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  saveTokens: (access: string, refresh: string) => void;
  clearSession: () => void;
}): void {
  readAccessToken = store.getAccessToken;
  readRefreshToken = store.getRefreshToken;
  persistTokens = store.saveTokens;
  dropSession = store.clearSession;
}

/* ---- refresh single-flight: parallel 401s share ONE refresh call ---- */

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_BASE_URL}/auth/refresh${portQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const payload = (await res.json().catch(() => null)) as
    | { data?: { accessToken: string; refreshToken: string } }
    | null;
  if (!payload?.data?.accessToken || !payload.data.refreshToken) return false;
  // Rotation: the old refresh token is dead — persist the new pair.
  persistTokens(payload.data.accessToken, payload.data.refreshToken);
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
    res = await fetch(`${API_BASE_URL}${path}${portQuery()}`, { ...init, headers });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Can't reach DEAL right now. Check your connection.", 0);
  }

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | ErrorEnvelope
    | null;

  if (res.ok && body && body.success) return body.data;

  const error = body && !body.success ? body.error : undefined;
  throw new ApiError(
    error?.code ?? `HTTP_${res.status}`,
    error?.message ?? "Something went wrong. Please try again.",
    res.status,
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
