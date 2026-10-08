"use client";

/**
 * Session persistence for the browser SPA.
 *
 * - Access/refresh tokens: localStorage (rotating opaque refresh token —
 *   see the Phase 4 token model; the cookie upgrade is a Phase 12 hardening
 *   candidate, documented in the walkthrough).
 * - The session user: a prototype-compatible `SafeUser` — the backend's
 *   auth user (id/email/phone/role) MERGED with the creator profile
 *   (name/handle/craft/channels/...). Screens keep reading one flat object,
 *   exactly like the prototype's `deal_user`.
 */

import type { ChannelType, CreatorChannel, PaymentProvider, User } from "@/lib/types";
import { bindTokenStore } from "./client";
import type { OwnedProfile, SafeUserDto } from "./backend.types";

const ACCESS_KEY = "deal_access_token";
const REFRESH_KEY = "deal_refresh_token";
export const USER_KEY = "deal_user";
/** Transient hand-off: the name entered at signup, consumed by onboarding. */
const SIGNUP_NAME_KEY = "deal_signup_name";

/** The prototype's user shape (password excluded) — screens depend on it. */
export type SessionUser = Omit<User, "password">;

/* ---- raw storage helpers ---- */

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/* ---- tokens ---- */

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function saveTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function getSessionUser(): SessionUser | null {
  return readJson<SessionUser>(USER_KEY);
}

export function setSessionUser(user: SessionUser | null): void {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

/** Whole session gone (logout, refresh failure, reuse detection). */
export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Wire the transport's token hooks to this storage (import-time side effect). */
bindTokenStore({
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearSession,
});

/* ---- signup-name hand-off (name lives on the profile, not the auth user) ---- */

export function stashSignupName(name: string): void {
  sessionStorage.setItem(SIGNUP_NAME_KEY, name.trim());
}

export function takeStashedSignupName(): string {
  const name = sessionStorage.getItem(SIGNUP_NAME_KEY) ?? "";
  sessionStorage.removeItem(SIGNUP_NAME_KEY);
  return name;
}

/* ---- session user assembly (auth user + creator profile → flat object) ---- */

const PROVIDERS: PaymentProvider[] = ["flutterwave", "paystack"];

const CHANNEL_TYPES_LOWERCASE: ChannelType[] = [
  "whatsapp",
  "telegram",
  "instagram",
  "email",
  "phone_call",
  "sms",
  "x_twitter",
  "linkedin",
  "tiktok",
];

/** Backend channel types are UPPER_SNAKE — screens use the prototype's lowercase. */
function mapChannelType(type: string): ChannelType | null {
  const normalized = type.toLowerCase() as ChannelType;
  return CHANNEL_TYPES_LOWERCASE.includes(normalized) ? normalized : null;
}

function mapChannels(profile: OwnedProfile | null): CreatorChannel[] {
  if (!profile) return [];
  const mapped: CreatorChannel[] = [];
  for (const channel of profile.channels) {
    const type = mapChannelType(channel.type);
    if (type) mapped.push({ type, value: channel.value, primary: channel.isPrimary });
  }
  return mapped;
}

/** A fresh signup has no profile yet — the flat user degrades gracefully. */
export function buildSessionUser(user: SafeUserDto, profile: OwnedProfile | null): SessionUser {
  const preferredProvider = profile?.preferredProvider
    ? (profile.preferredProvider.toLowerCase() as PaymentProvider)
    : "flutterwave";
  const channels = mapChannels(profile);
  const whatsapp = channels.find((c) => c.type === "whatsapp")?.value ?? user.phone ?? "";

  return {
    id: user.id,
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    updatedAt: user.updatedAt,
    // profile fields — empty/false until onboarding creates them
    name: profile?.name ?? "",
    handle: profile?.handle ?? "",
    craft: profile?.craft ?? "",
    location: profile?.location ?? "",
    bio: profile?.bio ?? "",
    verified: profile?.verified ?? false,
    onboarded: profile?.onboarded ?? false,
    channels,
    whatsapp,
    preferredProvider: PROVIDERS.includes(preferredProvider) ? preferredProvider : "flutterwave",
    createdAt: profile?.createdAt ?? user.createdAt,
  };
}
