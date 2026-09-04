import {
  getDB,
  saveDB,
  newId,
  newToken,
  nextRef,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const creatorId = new URL(request.url).searchParams.get("creatorId");
  if (!creatorId) return jsonError("creatorId is required.");

  const db = getDB();
  const deals = db.deals
    .filter((d) => d.creatorId === creatorId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return jsonOk({ deals });
}

interface CreateBody {
  creatorId: string;
  requestId?: string | null;
  title?: string;
  serviceTitle?: string;
  clientName?: string;
  clientContact?: string;
}

export async function POST(request: Request) {
  const body = await readBody<CreateBody>(request);
  if (!body?.creatorId) return jsonError("creatorId is required.");

  const db = getDB();
  const creator = db.users.find((u) => u.id === body.creatorId);
  if (!creator) return jsonError("Creator not found.", 404);

  let requestId = body.requestId ?? null;
  if (requestId) {
    const linked = db.requests.find((r) => r.id === requestId);
    if (linked) linked.status = "replied";
  }

  const now = new Date().toISOString();
  const deal: Deal = {
    id: newId("d"),
    ref: nextRef("DEAL", db.deals),
    creatorId: creator.id,
    requestId,
    shareToken: newToken(),
    title: body.title?.trim() || "Untitled deal",
    serviceTitle: body.serviceTitle?.trim() || "",
    client: {
      name: body.clientName?.trim() || "",
      contact: body.clientContact?.trim() || "",
    },
    summary: "",
    eventDate: "",
    location: "",
    message: "",
    scope: "",
    deliverables: [],
    price: 0,
    depositPercent: 50,
    startDate: "",
    dueDate: "",
    revisions: 2,
    status: "draft",
    events: [{ at: now, type: "created", label: "Deal created", actor: "creator" }],
    payments: [],
    deliveries: [],
    finalFiles: [],
    createdAt: now,
  };

  db.deals.push(deal);
  saveDB();
  return jsonOk({ deal }, 201);
}
