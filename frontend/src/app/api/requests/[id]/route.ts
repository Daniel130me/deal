import { getDB, saveDB, jsonOk, jsonError, readBody } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();
  const req = db.requests.find((r) => r.id === id);
  if (!req) return jsonError("Request not found.", 404);

  return jsonOk({
    request: req,
    service: db.services.find((s) => s.id === req.serviceId) ?? null,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await readBody<{ action?: string }>(request);
  const db = getDB();
  const req = db.requests.find((r) => r.id === id);
  if (!req) return jsonError("Request not found.", 404);

  if (body?.action === "decline") {
    req.status = "declined";
    saveDB();
    return jsonOk({ request: req });
  }

  if (body?.action === "archive") {
    req.status = "archived";
    saveDB();
    return jsonOk({ request: req });
  }

  return jsonError("Unknown action.");
}
