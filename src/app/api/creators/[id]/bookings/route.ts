import { getDB, jsonOk, jsonError } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();

  const creator = db.users.find((u) => u.id === id);
  if (!creator) return jsonError("Creator not found.", 404);

  const bookings = db.bookings
    .filter((b) => b.creatorId === id)
    .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));

  return jsonOk({ bookings });
}
