import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { DB, PaymentProvider } from "@/lib/types";

/**
 * Ultra-fast JSON data layer for the clickable prototype.
 *
 * - The whole database lives in `db/db.json`.
 * - It is loaded ONCE into memory; every read is served straight from RAM
 *   (sub-millisecond, no driver, no network hop — faster than a separate
 *   json-server process).
 * - Writes mutate the in-memory object, then persist atomically
 *   (tmp file + rename) so the file on disk is never corrupted.
 */
const DB_PATH = path.join(process.cwd(), "db", "db.json");

/**
 * The parsed DB lives on globalThis so hot-module reloads (which re-evaluate
 * this module) always share ONE in-memory database instead of forking a
 * second, stale copy that could clobber the file on save.
 */
const globalStore = globalThis as unknown as { __dealDb?: DB };

export function getDB(): DB {
  if (!globalStore.__dealDb) {
    globalStore.__dealDb = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as DB;
  }
  return globalStore.__dealDb;
}

export function reloadDB(): DB {
  globalStore.__dealDb = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as DB;
  return globalStore.__dealDb;
}

export function saveDB(): void {
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(getDB(), null, 2));
  fs.renameSync(tmp, DB_PATH);
}

export function newId(prefix = "id"): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function newToken(): string {
  return `tok_${randomBytes(5).toString("hex")}`;
}

export function nextRef(
  prefix: "DEAL" | "REQ" | "BKG",
  items: { ref: string }[]
): string {
  const max = items.reduce((acc, item) => {
    const n = Number(item.ref?.split("-").pop() ?? 0);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** Gateway transaction reference — the rail that processed the charge (escrow itself is DEAL's). */
export function newGatewayRef(provider: PaymentProvider = "flutterwave"): string {
  const prefix = provider === "paystack" ? "PSK" : "FLW";
  return `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

export function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_CACHE });
}

export function jsonError(error: string, status = 400) {
  return Response.json({ error }, { status, headers: NO_CACHE });
}

export async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
