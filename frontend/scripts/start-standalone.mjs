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

// Next's generated standalone server reads HOSTNAME when it starts. Render
// also exposes the instance's internal hostname through that variable, which
// is not a public bind address and prevents the edge router from connecting.
// Force the documented all-interface bind only on Render; local deployments
// can still choose their own hostname explicitly.
if (process.env.RENDER === "true") {
  process.env.HOSTNAME = "0.0.0.0";
}

// Next resolves public and .next/static relative to the standalone server's
// working directory. The build helper copies both directories here.
process.chdir(serverRoot);
await import(pathToFileURL(resolve(serverRoot, "server.js")).href);
