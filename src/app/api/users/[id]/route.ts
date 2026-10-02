import { getDB, saveDB, jsonOk, jsonError, readBody } from "@/lib/store";
import { isPaymentProvider } from "@/lib/types";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();
  const user = db.users.find((u) => u.id === id);
  if (!user) return jsonError("Creator not found.", 404);
  const { password: _pw, ...safe } = user;
  return jsonOk({ user: safe });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await readBody<Partial<User>>(request);
  if (!body) return jsonError("Invalid request body.");

  const db = getDB();
  const user = db.users.find((u) => u.id === id);
  if (!user) return jsonError("Creator not found.", 404);

  const allowed: (keyof User)[] = [
    "name",
    "craft",
    "location",
    "bio",
    "whatsapp",
    "phone",
    "channels",
    "onboarded",
    "preferredProvider",
  ];
  for (const key of allowed) {
    if (key in body && body[key] !== undefined) {
      if (key === "preferredProvider" && !isPaymentProvider(body.preferredProvider)) continue;
      // @ts-expect-error — prototype-grade assignment across narrow types
      user[key] = body[key];
    }
  }
  saveDB();

  const { password: _pw, ...safe } = user;
  return jsonOk({ user: safe });
}
