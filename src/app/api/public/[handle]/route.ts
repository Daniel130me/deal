import { getDB, jsonOk, jsonError } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { handle } = await params;
  const db = getDB();
  const creator = db.users.find((u) => u.handle === handle);
  if (!creator) return jsonError("Creator not found.", 404);

  const { password: _pw, ...safe } = creator;
  return jsonOk({
    creator: safe,
    services: db.services.filter((s) => s.userId === creator.id),
  });
}
