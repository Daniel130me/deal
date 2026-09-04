import { getDB, jsonOk, jsonError } from "@/lib/store";
import { depositAmount, balanceAmount } from "@/lib/types";
import type { Deal, DealStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ONGOING: DealStatus[] = ["active", "delivered", "revision", "approved"];
const PENDING: DealStatus[] = ["sent", "changes_requested"];

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();

  const creator = db.users.find((u) => u.id === id);
  if (!creator) return jsonError("Creator not found.", 404);

  const deals = db.deals.filter((d) => d.creatorId === id);
  const requests = db.requests.filter(
    (r) => r.creatorId === id && r.status !== "archived" && r.status !== "declined"
  );

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const earned = deals.reduce(
    (sum, d) =>
      sum +
      d.payments
        .filter((p) => p.status === "released")
        .reduce((s, p) => s + p.amount, 0),
    0
  );
  const inEscrow = deals.reduce(
    (sum, d) =>
      sum +
      d.payments.filter((p) => p.status === "held").reduce((s, p) => s + p.amount, 0),
    0
  );
  const expected = deals
    .filter((d) => ONGOING.includes(d.status) || d.status === "balance_paid")
    .reduce((sum, d) => sum + balanceAmount(d), 0);

  const overview = {
    creator: (() => {
      const { password: _pw, ...safe } = creator;
      return safe;
    })(),
    stats: {
      totalRequests: requests.length,
      newRequests: requests.filter((r) => r.status === "new").length,
      pendingDeals: deals.filter((d) => PENDING.includes(d.status)).length,
      ongoingDeals: deals.filter((d) => ONGOING.includes(d.status)).length,
      completedDeals: deals.filter((d) => d.status === "completed").length,
      newThisWeek: requests.filter((r) => Date.parse(r.createdAt) > weekAgo).length,
    },
    money: {
      earnedThisMonth: earned,
      inEscrow,
      expectedBalance: expected,
      depositHeld: deals.reduce(
        (sum, d) =>
          d.payments.some((p) => p.status === "held")
            ? sum + depositAmount(d)
            : sum,
        0
      ),
    },
    earningsSeries: db.settings.earningsSeries,
    requests: [...requests]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 4)
      .map((r) => ({
        ...r,
        service: db.services.find((s) => s.id === r.serviceId) ?? null,
      })),
    deals: deals
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5)
      .map((d) => ({
        id: d.id,
        ref: d.ref,
        title: d.title,
        client: d.client.name,
        status: d.status,
        price: d.price,
        balance: balanceAmount(d),
        dueDate: d.dueDate,
        updatedAt: d.events.at(-1)?.at ?? d.createdAt,
      })),
  };

  return jsonOk(overview);
}
