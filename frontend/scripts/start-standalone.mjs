import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = resolve(frontendRoot, ".next", "standalone");
const serverRoot = [standaloneRoot, resolve(standaloneRoot, "frontend")].find((candidate) =>
  existsSync(resolve(candidate, "server.js")),
);

if (!serverRoot) {
  throw new Error("Next.js standalone output is missing; run `npm run build` first.");
}

// Next resolves public and .next/static relative to the standalone server's
// working directory. The build helper copies both directories here.
process.chdir(serverRoot);
await import(pathToFileURL(resolve(serverRoot, "server.js")).href);
