import fs from "fs";
import path from "path";
import { reloadDB, jsonOk } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Demo helper: restores db.json to its pristine seeded state.
 */
export async function POST() {
  const dbPath = path.join(process.cwd(), "db", "db.json");
  const seedPath = path.join(process.cwd(), "db", "seed.json");
  fs.copyFileSync(seedPath, dbPath);
  reloadDB();
  return jsonOk({ ok: true });
}
