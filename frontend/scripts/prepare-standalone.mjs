import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = resolve(frontendRoot, ".next", "standalone");

if (!existsSync(standaloneRoot)) {
  throw new Error("Next.js standalone output is missing; run this script after next build.");
}

const serverRoot = [standaloneRoot, resolve(standaloneRoot, "frontend")].find((candidate) =>
  existsSync(resolve(candidate, "server.js")),
);
if (!serverRoot) {
  throw new Error("Next.js standalone server.js is missing from the flat and workspace output locations.");
}

const standaloneNext = resolve(serverRoot, ".next");
mkdirSync(standaloneNext, { recursive: true });

// Next's standalone server excludes immutable/static assets by design. Copy
// them with Node APIs so the build works identically on Windows and POSIX CI.
cpSync(resolve(frontendRoot, ".next", "static"), resolve(standaloneNext, "static"), {
  recursive: true,
  force: true,
});
cpSync(resolve(frontendRoot, "public"), resolve(serverRoot, "public"), {
  recursive: true,
  force: true,
});
