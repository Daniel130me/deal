import { ChannelType } from '@prisma/client';

/**
 * Creator domain rules — named constants instead of magic values (todo.md C2).
 *
 * Handle rules: lowercase letters/digits/hyphens, 3-30 chars. Handles appear
 * in public URLs (/public/:handle) and share links, so the alphabet is kept
 * URL-safe and lowercase-normalised at the DTO layer.
 */
export const HANDLE_PATTERN = /^[a-z0-9-]{3,30}$/;
export const HANDLE_MAX_LENGTH = 30;

/**
 * The crafts DEAL is niched down to (mirrors the product's craft list). The DB
 * column is free-form on purpose (schema comment) so adding a craft later is a
 * code-only change — this list is the single validation point.
 */
export const CREATOR_CRAFTS = [
  'Photographer',
  'Videographer',
  'Motion designer',
  'Graphic designer',
  'Video editor',
  'Illustrator',
  'Voice artist',
] as const;

/** Bounds that keep profile text fields display-friendly and storage bounded. */
export const PROFILE_NAME_MAX = 120;
export const PROFILE_BIO_MAX = 1_000;
export const LOCATION_MAX = 200;
export const CHANNEL_VALUE_MAX = 120;

/** One channel per ChannelType (the @@unique constraint allows no more anyway). */
export const MAX_CHANNELS = Object.keys(ChannelType).length;

/**
 * Kobo cap shared by every money input this phase. Prisma `Int` is 4 bytes
 * (max 2,147,483,647); 2,000,000,000 kobo = ₦20,000,000, which leaves headroom
 * while guaranteeing no integer overflow on sums of a few line items.
 */
export const MAX_MONEY_MINOR = 2_000_000_000;
