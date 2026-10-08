/**
 * Auth session policy — named constants instead of magic values, so token
 * lifetimes and crypto sizes are reviewable in one place.
 *
 * Access TTL is deliberately SHORT (15 min): a stolen access token's blast
 * radius is bounded by it. Refresh TTL is long enough that Nigerian users on
 * flaky mobile connections are not logged out mid-week; its blast radius is
 * contained by rotation + family revocation (see RefreshToken schema).
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

/** Raw refresh token = 256 bits of CSPRNG entropy (encoded base64url, 43 chars). */
export const REFRESH_TOKEN_BYTES = 32;

/** JWT issuer/audience pins — tokens minted for another service fail verification. */
export const JWT_ISSUER = 'deal.api';
export const JWT_AUDIENCE = 'deal.app';
