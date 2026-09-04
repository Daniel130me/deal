import {
  getDB,
  saveDB,
  newId,
  nextRef,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";
import type { ClientRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

interface RequestBody {
  serviceId?: string;
  clientName?: string;
  clientContact?: string;
  eventDate?: string;
  location?: string;
  budgetMin?: number;
  budgetMax?: number;
  description?: string;
  notes?: string;
}

export async function POST(request: Request, { params }: Params) {
  const { handle } = await params;
  const body = await readBody<RequestBody>(request);

  if (!body?.serviceId || !body?.clientName || !body?.clientContact || !body?.description) {
    return jsonError("Service, your name, contact and project details are required.");
  }

  const db = getDB();
  const creator = db.users.find((u) => u.handle === handle);
  if (!creator) return jsonError("Creator not found.", 404);
  if (!db.services.some((s) => s.id === body.serviceId)) {
    return jsonError("Service not found.", 404);
  }

  const req: ClientRequest = {
    id: newId("r"),
    ref: nextRef("REQ", db.requests),
    creatorId: creator.id,
    serviceId: body.serviceId,
    clientName: body.clientName.trim(),
    clientContact: body.clientContact.trim(),
    eventDate: body.eventDate ?? "",
    location: body.location ?? "",
    budgetMin: body.budgetMin ?? 0,
    budgetMax: body.budgetMax ?? 0,
    description: body.description.trim(),
    notes: body.notes?.trim() ?? "",
    status: "new",
    createdAt: new Date().toISOString(),
  };

  db.requests.push(req);
  saveDB();
  return jsonOk({ request: req }, 201);
}
