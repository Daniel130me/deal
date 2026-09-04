import {
  getDB,
  saveDB,
  newId,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SignupBody {
  name?: string;
  contact?: string;
  password?: string;
}

export async function POST(request: Request) {
  const body = await readBody<SignupBody>(request);
  if (!body?.name || !body?.contact || !body?.password) {
    return jsonError("Name, email/phone and password are required.");
  }
  if (body.password.length < 8) {
    return jsonError("Password must be at least 8 characters.");
  }

  const db = getDB();
  const contact = body.contact.trim().toLowerCase();
  const exists = db.users.some(
    (u) => u.email.toLowerCase() === contact || u.phone.replace(/\s/g, "") === contact.replace(/\s/g, "")
  );
  if (exists) {
    return jsonError("This email or phone is already registered. Try logging in.", 409);
  }

  const handleBase =
    body.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .join("-")
      .slice(0, 24) || "creator";

  let handle = handleBase;
  let n = 1;
  while (db.users.some((u) => u.handle === handle)) {
    n += 1;
    handle = `${handleBase}-${n}`;
  }

  const user: User = {
    id: newId("u"),
    name: body.name.trim(),
    handle,
    email: contact.includes("@") ? contact : `${handle}@deal.ng`,
    phone: contact.includes("@") ? "" : contact,
    whatsapp: contact.includes("@") ? "" : contact,
    password: body.password,
    craft: "",
    location: "",
    bio: "",
    verified: false,
    onboarded: false,
    createdAt: new Date().toISOString(),
  };

  db.users.push(user);
  saveDB();

  const { password: _pw, ...safe } = user;
  return jsonOk({ user: safe }, 201);
}
