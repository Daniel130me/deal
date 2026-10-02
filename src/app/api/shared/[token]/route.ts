import {
  getDB,
  saveDB,
  newId,
  newGatewayRef,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";
import {
  depositAmount,
  isApproved,
  isPaymentProvider,
  nextDueSlot,
  paymentSchedule,
  remainingBalance,
  PROVIDER_META,
} from "@/lib/types";
import type { Deal, DealPayment, PaymentMethod, PaymentProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Card payment",
  transfer: "Bank transfer",
  ussd: "USSD payment",
};

function makePayment(
  deal: Deal,
  args: {
    type: DealPayment["type"];
    label: string;
    amount: number;
    method: PaymentMethod;
    provider: PaymentProvider;
    now: string;
  }
): DealPayment {
  const released = isApproved(deal);
  return {
    id: newId("p"),
    type: args.type,
    label: args.label,
    amount: args.amount,
    method: args.method,
    methodLabel: METHOD_LABELS[args.method] ?? "Card payment",
    provider: args.provider,
    reference: newGatewayRef(args.provider),
    status: released ? "released" : "held",
    paidAt: args.now,
    ...(released ? { releasedAt: args.now } : {}),
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const db = getDB();
  const deal = db.deals.find((d) => d.shareToken === token);
  if (!deal) return jsonError("Deal not found. Check your link.", 404);

  const creator = db.users.find((u) => u.id === deal.creatorId);
  const { password: _pw, ...safeCreator } = creator!;

  const paid = deal.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, deal.price - paid);
  const schedule = paymentSchedule(deal);
  const nextDue = schedule.find((s) => s.status === "due") ?? null;

  return jsonOk({
    deal,
    creator: {
      id: safeCreator.id,
      name: safeCreator.name,
      handle: safeCreator.handle,
      craft: safeCreator.craft,
      location: safeCreator.location,
      verified: safeCreator.verified,
      whatsapp: safeCreator.whatsapp,
      channels: safeCreator.channels ?? [],
      preferredProvider: isPaymentProvider(safeCreator.preferredProvider)
        ? safeCreator.preferredProvider
        : "flutterwave",
    },
    amounts: {
      total: deal.price,
      deposit: depositAmount(deal),
      paid,
      due: remaining,
      held: deal.payments
        .filter((p) => p.status === "held")
        .reduce((s, p) => s + p.amount, 0),
      schedule,
      nextDue,
      fullyPaid: remaining === 0,
      approved: isApproved(deal),
    },
  });
}

interface ActionBody {
  action?: string;
  note?: string;
  method?: PaymentMethod;
  provider?: string;
  rating?: number;
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = await readBody<ActionBody>(request);
  const db = getDB();
  const deal = db.deals.find((d) => d.shareToken === token);
  if (!deal) return jsonError("Deal not found. Check your link.", 404);

  const now = new Date().toISOString();
  const method: PaymentMethod =
    body?.method === "transfer" || body?.method === "ussd" ? body.method : "card";
  const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
  const creator = db.users.find((u) => u.id === deal.creatorId);
  // The client picks the rail (Flutterwave or Paystack); defaults to the creator's preferred one.
  const provider: PaymentProvider = isPaymentProvider(body?.provider)
    ? body.provider
    : isPaymentProvider(creator?.preferredProvider)
      ? creator.preferredProvider
      : "flutterwave";
  const via = PROVIDER_META[provider].label;

  switch (body?.action) {
    case "pay-deposit": {
      if (deal.status !== "sent" && deal.status !== "changes_requested") {
        return jsonError("This deal is not awaiting acceptance.", 409);
      }
      const amount = depositAmount(deal);
      deal.status = "active";
      deal.acceptedAt = now;
      deal.depositPaidAt = now;
      const payment = makePayment(deal, {
        type: "deposit",
        label: `Deposit (${deal.depositPercent}%)`,
        amount,
        method,
        provider,
        now,
      });
      deal.payments.push(payment);
      deal.events.push(
        { at: now, type: "accepted", label: "Deal accepted", actor: "client" },
        {
          at: now,
          type: "deposit_paid",
          label: `Deposit paid — ${naira(amount)} held in DEAL escrow via ${via} (ref ${payment.reference})`,
          actor: "client",
        }
      );
      break;
    }

    case "pay-next": {
      if (
        deal.status !== "active" &&
        deal.status !== "delivered" &&
        deal.status !== "revision" &&
        deal.status !== "approved" &&
        deal.status !== "files_released" &&
        deal.status !== "completed"
      ) {
        return jsonError("Payments can only be made after the deal is accepted.", 409);
      }
      const remaining = remainingBalance(deal);
      if (remaining <= 0) return jsonError("This deal is already fully paid.", 409);
      const slot = nextDueSlot(deal);
      const amount = slot ? Math.min(slot.amount, remaining) : remaining;
      const payment = makePayment(deal, {
        type: slot?.type ?? "balance",
        label: slot?.label ?? "Balance payment",
        amount,
        method,
        provider,
        now,
      });
      deal.payments.push(payment);
      if (isApproved(deal)) {
        deal.events.push({
          at: now,
          type: "payment_released",
          label: `${payment.label} paid — ${naira(amount)} received by creator (work already approved, ref ${payment.reference})`,
          actor: "client",
        });
      } else {
        deal.events.push({
          at: now,
          type: "balance_paid",
          label: `${payment.label} paid — ${naira(amount)} held in DEAL escrow via ${via} (ref ${payment.reference})`,
          actor: "client",
        });
      }
      break;
    }

    case "pay-remaining": {
      if (
        deal.status !== "active" &&
        deal.status !== "delivered" &&
        deal.status !== "revision" &&
        deal.status !== "approved" &&
        deal.status !== "files_released" &&
        deal.status !== "completed"
      ) {
        return jsonError("Payments can only be made after the deal is accepted.", 409);
      }
      const amount = remainingBalance(deal);
      if (amount <= 0) return jsonError("This deal is already fully paid.", 409);
      const payment = makePayment(deal, {
        type: "balance",
        label: "Balance payment",
        amount,
        method,
        provider,
        now,
      });
      deal.payments.push(payment);
      if (isApproved(deal)) {
        deal.events.push({
          at: now,
          type: "payment_released",
          label: `Balance paid in full — ${naira(amount)} received by creator (work already approved, ref ${payment.reference})`,
          actor: "client",
        });
      } else {
        deal.events.push({
          at: now,
          type: "balance_paid",
          label: `Balance paid in full — ${naira(amount)} held in DEAL escrow via ${via} (ref ${payment.reference})`,
          actor: "client",
        });
      }
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
        label: "Work approved by client — completed",
        actor: "client",
      });
      // Escrow releases to the creator ONLY now.
      const held = deal.payments.filter((p) => p.status === "held");
      const releasedTotal = held.reduce((s, p) => s + p.amount, 0);
      if (held.length > 0) {
        deal.payments = deal.payments.map((p) =>
          p.status === "held" ? { ...p, status: "released", releasedAt: now } : p
        );
        deal.paymentReleasedAt = now;
        deal.events.push({
          at: now,
          type: "payment_released",
          label: `${naira(releasedTotal)} released from escrow to the creator's payout account`,
          actor: "system",
        });
      }
      break;
    }

    case "complete": {
      if (deal.status !== "files_released") {
        return jsonError("Final files have not been released yet.", 409);
      }
      deal.status = "completed";
      deal.completedAt = now;
      deal.events.push({
        at: now,
        type: "completed",
        label:
          body.rating != null
            ? `Client downloaded final files and left a ${body.rating}-star review`
            : "Deal completed — client confirmed delivery",
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

    default:
      return jsonError("Unknown action.");
  }

  saveDB();
  return jsonOk({ deal });
}
