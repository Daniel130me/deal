import { getDB, jsonOk, jsonError } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();

  if (!db.users.some((u) => u.id === id)) {
    return jsonError("Creator not found.", 404);
  }

  const requests = db.requests
    .filter((r) => r.creatorId === id && r.status !== "declined")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const withService = requests.map((r) => ({
    ...r,
    service: db.services.find((s) => s.id === r.serviceId) ?? null,
  }));

  return jsonOk({ requests: withService });
}
