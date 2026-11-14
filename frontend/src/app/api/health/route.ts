import { NextResponse } from "next/server";

import { dealApiOrigin } from "@/lib/server/deal-api-origin";

const READINESS_PATH = "/health/ready";
const MAX_READINESS_ATTEMPTS = 7;
const READINESS_ATTEMPT_TIMEOUT_MS = 5_000;
const READINESS_RETRY_DELAY_MS = 1_000;
const READY_CACHE_MS = 30_000;
const UNAVAILABLE_CACHE_MS = 5_000;

let readinessCheckInFlight: Promise<boolean> | null = null;
let lastReadinessResult = false;
let lastReadinessCheckAt = 0;

export const dynamic = "force-dynamic";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isApiReady(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}${READINESS_PATH}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(READINESS_ATTEMPT_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runReadinessChecks(origin: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_READINESS_ATTEMPTS; attempt += 1) {
    if (await isApiReady(origin)) return true;
    if (attempt < MAX_READINESS_ATTEMPTS) {
      await delay(READINESS_RETRY_DELAY_MS);
    }
  }
  return false;
}

async function ensureUpstreamReady(origin: string): Promise<boolean> {
  const cacheLifetime = lastReadinessResult ? READY_CACHE_MS : UNAVAILABLE_CACHE_MS;
  if (Date.now() - lastReadinessCheckAt < cacheLifetime) {
    return lastReadinessResult;
  }

  // Collapse concurrent browser requests into one bounded upstream probe loop.
  // This protects the API from a thundering herd while a free instance wakes.
  if (!readinessCheckInFlight) {
    readinessCheckInFlight = runReadinessChecks(origin)
      .then((ready) => {
        lastReadinessResult = ready;
        lastReadinessCheckAt = Date.now();
        return ready;
      })
      .finally(() => {
        readinessCheckInFlight = null;
      });
  }

  return readinessCheckInFlight;
}

/**
 * Wake and probe the API before the browser sends a state-changing request.
 * Render free services can sleep independently, so this prevents a login POST
 * from being the request that encounters the provider's temporary 502 page.
 */
export async function GET(): Promise<NextResponse> {
  const origin = dealApiOrigin();
  if (await ensureUpstreamReady(origin)) {
    return NextResponse.json(
      { success: true, data: { ready: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "DEAL is taking longer than expected to start. Please try again in a moment.",
      },
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "5",
      },
    },
  );
}
