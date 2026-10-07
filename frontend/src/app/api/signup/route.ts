import { NextResponse } from "next/server";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  contact: z
    .string()
    .trim()
    .min(7)
    .max(80)
    .refine(
      (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ||
        /^\+?[0-9][0-9\s-]{6,17}$/.test(value),
      "Enter a valid email or phone number"
    ),
  password: z.string().min(8).max(100),
});

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

// naive in-memory rate limit: 8 requests / minute / ip
const rateBucket = new Map<string, number[]>();
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateBucket.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateBucket.set(ip, hits);
  if (rateBucket.size > 5000) rateBucket.clear();
  return hits.length > RATE_LIMIT;
}

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "local";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please wait a minute." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Please check your details.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const { name, contact, password } = parsed.data;
    const normalizedContact = contact.toLowerCase();

    const existing = await db.signup.findUnique({
      where: { contact: normalizedContact },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "This email or phone is already registered. Try logging in.",
        },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);

    // verify roundtrip (guards against corrupted hash)
    const [salt, digest] = passwordHash.split(":");
    const check = scryptSync(password, salt, 64);
    if (!timingSafeEqual(check, Buffer.from(digest, "hex"))) {
      throw new Error("hash verification failed");
    }

    await db.signup.create({
      data: { name, contact: normalizedContact, passwordHash },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[signup] failed:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong on our side. Try again." },
      { status: 500 }
    );
  }
}
