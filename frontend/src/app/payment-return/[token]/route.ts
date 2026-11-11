import { type NextRequest, NextResponse } from "next/server";

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;
const PROVIDER_RETURN_FIELDS = ["status", "tx_ref", "reference", "transaction_id"] as const;

function publicOrigin(request: NextRequest): string {
  // Behind Render's proxy, request.url may carry the container hostname.
  // Render supplies this immutable service URL; using it also avoids trusting
  // a caller-controlled Host header when redirecting a capability token.
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    try {
      const parsed = new URL(renderUrl);
      if (parsed.protocol === "https:") return parsed.origin;
    } catch {
      // A malformed optional platform value falls back to Next's request URL.
    }
  }
  return request.nextUrl.origin;
}

/**
 * Payment providers require a real HTTP callback; the application itself uses
 * hash routes. This server route bridges the two without trusting the returned
 * status: the client screen still asks the backend to verify with the provider.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const destination = new URL("/", publicOrigin(request));

  if (!SHARE_TOKEN_PATTERN.test(token)) {
    return NextResponse.redirect(destination, 303);
  }

  for (const field of PROVIDER_RETURN_FIELDS) {
    const value = request.nextUrl.searchParams.get(field);
    if (value) destination.searchParams.set(field, value);
  }
  destination.hash = `/c/${encodeURIComponent(token)}`;
  return NextResponse.redirect(destination, 303);
}
