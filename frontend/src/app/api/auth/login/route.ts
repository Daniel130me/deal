import { getDB, jsonOk, jsonError, readBody } from "@/lib/store";

export const dynamic = "force-dynamic";

interface LoginBody {
  contact?: string;
  password?: string;
}

export async function POST(request: Request) {
  const body = await readBody<LoginBody>(request);
  if (!body?.contact || !body?.password) {
    return jsonError("Enter your email/phone and password.");
  }

  const db = getDB();
  const contact = body.contact.trim().toLowerCase();
  const user = db.users.find(
    (u) =>
      u.email.toLowerCase() === contact ||
      u.phone.replace(/\s/g, "").toLowerCase() === contact.replace(/\s/g, "")
  );

  if (!user || user.password !== body.password) {
    return jsonError("Incorrect email/phone or password.", 401);
  }

  const { password: _pw, ...safe } = user;
  return jsonOk({ user: safe });
}
