import {
  getDB,
  saveDB,
  newId,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";
import { balanceAmount, depositAmount } from "@/lib/types";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

function clientDeal(deal: Deal) {
  // strip anything the client shouldn't see
  return deal;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const db = getDB();
  const deal = db.deals.find((d) => d.shareToken === token);
  if (!deal) return jsonError("Deal not found. Check your link.", 404);

  const creator = db.users.find((u) => u.id === deal.creatorId);
  const { password: _pw, ...safeCreator } = creator!;

  return jsonOk({
    deal: clientDeal(deal),
    creator: {
      id: safeCreator.id,
      name: safeCreator.name,
      handle: safeCreator.handle,
      craft: safeCreator.craft,
      location: safeCreator.location,
      verified: safeCreator.verified,
      whatsapp: safeCreator.whatsapp,
    },
    amounts: {
      total: deal.price,
      deposit: depositAmount(deal),
      balance: balanceAmount(deal),
      paid: deal.payments.reduce((s, p) => s + p.amount, 0),
      due: Math.max(0, deal.price - deal.payments.reduce((s, p) => s + p.amount, 0)),
    },
  });
}

interface ActionBody {
  action?: string;
  note?: string;
  method?: string;
  rating?: number;
  reviewText?: string;
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = await readBody<ActionBody>(request);
  const db = getDB();
  const deal = db.deals.find((d) => d.shareToken === token);
  if (!deal) return jsonError("Deal not found. Check your link.", 404);

  const now = new Date().toISOString();

  switch (body?.action) {
    case "pay-deposit": {
      if (deal.status !== "sent" && deal.status !== "changes_requested") {
        return jsonError("This deal is not awaiting acceptance.", 409);
      }
      deal.status = "active";
      deal.acceptedAt = now;
      deal.depositPaidAt = now;
      deal.payments.push({
        id: newId("p"),
        type: "deposit",
        amount: depositAmount(deal),
        method: body.method ?? "Card",
        status: "held",
        paidAt: now,
      });
      deal.events.push(
        { at: now, type: "accepted", label: "Deal accepted", actor: "client" },
        {
          at: now,
          type: "deposit_paid",
          label: `Deposit paid — ₦${depositAmount(deal).toLocaleString("en-NG")} secured in escrow`,
          actor: "client",
        }
      );
      break;
    }

    case "request-changes": {
      if (deal.status !== "sent" && deal.status !== "delivered") {
        return jsonError("No delivery is awaiting your review.", 409);
      }
      const fromDelivery = deal.status === "delivered";
      deal.status = fromDelivery ? "revision" : "changes_requested";
      deal.events.push({
        at: now,
        type: "changes_requested",
        label: fromDelivery
          ? `Revision requested${body.note ? `: “${body.note.trim()}”` : ""}`
          : `Changes requested${body.note ? `: “${body.note.trim()}”` : ""}`,
        actor: "client",
      });
      break;
    }

    case "approve": {
      if (deal.status !== "delivered") {
        return jsonError("No delivery is awaiting your approval.", 409);
      }
      deal.status = "approved";
      deal.approvedAt = now;
      deal.events.push({
        at: now,
        type: "approved",
        label: "Delivery approved by client",
        actor: "client",
      });
      break;
    }

    case "pay-balance": {
      if (deal.status !== "approved") {
        return jsonError("Balance is not due yet.", 409);
      }
      deal.status = "balance_paid";
      deal.balancePaidAt = now;
      deal.payments.push({
        id: newId("p"),
        type: "balance",
        amount: balanceAmount(deal),
        method: body.method ?? "Card",
        status: "held",
        paidAt: now,
      });
      deal.events.push({
        at: now,
        type: "balance_paid",
        label: `Balance paid — ₦${balanceAmount(deal).toLocaleString("en-NG")} secured`,
        actor: "client",
      });
      break;
    }

    case "dispute": {
      if (deal.status !== "delivered" && deal.status !== "approved") {
        return jsonError("This deal can't be disputed right now.", 409);
      }
      deal.status = "disputed";
      deal.events.push({
        at: now,
        type: "disputed",
        label: `Dispute raised${body.note ? `: “${body.note.trim()}”` : ""} — our team will step in`,
        actor: "client",
      });
      break;
    }

    case "review": {
      deal.events.push({
        at: now,
        type: "completed",
        label: `Client left a ${body.rating ?? 5}-star review`,
        actor: "client",
      });
      break;
    }

    default:
      return jsonError("Unknown action.");
  }

  saveDB();
  return jsonOk({ deal });
}
