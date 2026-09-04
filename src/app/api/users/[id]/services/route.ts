import {
  getDB,
  saveDB,
  newId,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();
  return jsonOk({ services: db.services.filter((s) => s.userId === id) });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await readBody<Partial<Service>>(request);
  if (!body?.title || typeof body.from !== "number") {
    return jsonError("Service title and starting price are required.");
  }

  const db = getDB();
  if (!db.users.some((u) => u.id === id)) {
    return jsonError("Creator not found.", 404);
  }

  const service: Service = {
    id: newId("s"),
    userId: id,
    title: body.title.trim(),
    desc: body.desc?.trim() ?? "",
    from: body.from,
    duration: body.duration?.trim() ?? "Flexible",
    popular: false,
    includes: Array.isArray(body.includes) ? body.includes.slice(0, 10) : [],
  };
  db.services.push(service);
  saveDB();
  return jsonOk({ service }, 201);
}
