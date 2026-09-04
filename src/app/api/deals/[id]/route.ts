import {
  getDB,
  saveDB,
  newId,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";
import { balanceAmount } from "@/lib/types";
import type { Deal, DealFile } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const WIZARD_KEYS: (keyof Deal)[] = [
  "title",
  "serviceTitle",
  "summary",
  "eventDate",
  "location",
  "message",
  "scope",
  "deliverables",
  "price",
  "depositPercent",
  "startDate",
  "dueDate",
  "revisions",
];

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();
  const deal = db.deals.find((d) => d.id === id);
  if (!deal) return jsonError("Deal not found.", 404);

  const creator = db.users.find((u) => u.id === deal.creatorId);
  const { password: _pw, ...safeCreator } = creator!;
  return jsonOk({ deal, creator: safeCreator });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await readBody<Partial<Deal>>(request);
  if (!body) return jsonError("Invalid request body.");

  const db = getDB();
  const deal = db.deals.find((d) => d.id === id);
  if (!deal) return jsonError("Deal not found.", 404);

  for (const key of WIZARD_KEYS) {
    if (key in body && body[key] !== undefined) {
      // @ts-expect-error — prototype-grade assignment across narrow types
      deal[key] = body[key];
    }
  }
  if (body.client) deal.client = body.client;
  saveDB();
  return jsonOk({ deal });
}

interface ActionBody {
  action?: string;
  note?: string;
  method?: string;
  files?: DealFile[];
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await readBody<ActionBody>(request);
  const db = getDB();
  const deal = db.deals.find((d) => d.id === id);
  if (!deal) return jsonError("Deal not found.", 404);

  const now = new Date().toISOString();

  switch (body?.action) {
    case "send": {
      if (deal.status !== "draft" && deal.status !== "changes_requested") {
        return jsonError("This deal has already been sent.", 409);
      }
      if (!deal.title || !deal.client.name || !deal.price) {
        return jsonError("Add a title, client and price before sending.");
      }
      deal.status = "sent";
      deal.sentAt = now;
      deal.events.push({
        at: now,
        type: "sent",
        label: `Deal sent to ${deal.client.name}`,
        actor: "creator",
      });
      break;
    }

    case "deliver": {
      if (deal.status !== "active" && deal.status !== "revision") {
        return jsonError("You can only deliver an active deal.", 409);
      }
      deal.status = "delivered";
      deal.deliveredAt = now;
      deal.deliveries.push({
        id: newId("dl"),
        note:
          body.note?.trim() ||
          "Preview files for your review — final high-resolution set follows after approval.",
        files:
          body.files && body.files.length
            ? body.files
            : [
                { id: newId("f"), name: "Preview photos (High Res).zip", size: "45.6 MB", kind: "ZIP" },
                { id: newId("f"), name: "Preview photos (Web Size).zip", size: "18.9 MB", kind: "ZIP" },
              ],
        submittedAt: now,
      });
      deal.events.push({
        at: now,
        type: "delivered",
        label: "Delivery submitted for review",
        actor: "creator",
      });
      break;
    }

    case "release-files": {
      if (deal.status !== "balance_paid") {
        return jsonError("Final files can only be released after full payment.", 409);
      }
      deal.status = "files_released";
      deal.filesReleasedAt = now;
      deal.finalFiles =
        body.files && body.files.length
          ? body.files
          : [
              { id: newId("f"), name: "Final files — High Res.zip", size: "204.3 MB", kind: "ZIP" },
              { id: newId("f"), name: "Final files — Web Exports.zip", size: "28.9 MB", kind: "ZIP" },
            ];
      deal.events.push({
        at: now,
        type: "files_released",
        label: "Final files released to client",
        actor: "creator",
      });
      break;
    }

    case "confirm-payout": {
      if (deal.status !== "files_released") {
        return jsonError("Payout is only processed after files are released.", 409);
      }
      deal.status = "completed";
      deal.paymentReleasedAt = now;
      deal.completedAt = now;
      deal.payments = deal.payments.map((p) => ({ ...p, status: "released" }));
      const total = deal.payments.reduce((s, p) => s + p.amount, 0);
      deal.events.push({
        at: now,
        type: "payment_released",
        label: `₦${total.toLocaleString("en-NG")} released to your bank account`,
        actor: "system",
      });
      deal.events.push({ at: now, type: "completed", label: "Deal completed", actor: "system" });
      break;
    }

    default:
      return jsonError("Unknown action.");
  }

  saveDB();
  return jsonOk({ deal });
}
