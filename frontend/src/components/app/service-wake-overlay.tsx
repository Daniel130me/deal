"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Cloud, Loader2 } from "lucide-react";

import { Logo } from "@/components/landing/logo";
import {
  getApiReadinessSnapshot,
  subscribeToApiReadiness,
} from "@/lib/api/client";

const ELAPSED_TIME_REFRESH_MS = 1_000;
const LONG_WAIT_THRESHOLD_SECONDS = 120;

function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function ServiceWakeOverlay() {
  const readiness = useSyncExternalStore(
    subscribeToApiReadiness,
    getApiReadinessSnapshot,
    getApiReadinessSnapshot,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (readiness.phase === "idle") return;
    const timer = window.setInterval(() => setNow(Date.now()), ELAPSED_TIME_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [readiness.phase, readiness.startedAt]);

  if (readiness.phase === "idle" || readiness.startedAt === null) return null;

  const elapsedSeconds = Math.max(0, Math.floor((now - readiness.startedAt) / 1_000));
  const isLongWait = elapsedSeconds >= LONG_WAIT_THRESHOLD_SECONDS;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-[#edf3ef]/95 px-5 py-10"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <section className="w-full max-w-lg rounded-2xl bg-white px-6 py-8 shadow-[0_24px_70px_-30px_rgba(14,31,51,0.38)] sm:px-10 sm:py-10">
        <Logo />

        <div className="mt-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
          <Cloud className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-3xl">
          Starting your workspace
        </h1>
        <p className="mt-3 max-w-md text-base font-medium leading-7 text-muted-foreground">
          {isLongWait
            ? "This is taking longer than usual, but DEAL is still checking. You do not need to reload or submit again."
            : "The service pauses when it has not been used for a while. Keep this tab open—we’ll continue automatically as soon as it is ready."}
        </p>

        <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm font-bold">
          <span className="inline-flex items-center gap-2 text-accent-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {readiness.phase === "checking" ? "Checking availability" : "Waiting for the service"}
          </span>
          <span className="tabular-nums text-muted-foreground">
            Elapsed {formatElapsed(elapsedSeconds)}
          </span>
        </div>

        <p className="mt-6 border-t border-border pt-5 text-sm font-medium leading-6 text-muted-foreground">
          Your information is safe. DEAL will send your request only after the service is available.
        </p>
      </section>
    </div>
  );
}
