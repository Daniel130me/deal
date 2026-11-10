import type { NextConfig } from "next";

const DEFAULT_DEAL_API_ORIGIN = "http://localhost:3001";

/**
 * The browser uses same-origin `/api/v1` URLs so auth cookies belong to the
 * frontend site. Next proxies those requests to the private API origin.
 */
function dealApiOrigin(): string {
  const configured = process.env.DEAL_API_ORIGIN?.trim();
  const renderPrivateHost = process.env.DEAL_API_HOSTPORT?.trim();
  if (configured && renderPrivateHost) {
    throw new Error("Set only one of DEAL_API_ORIGIN or DEAL_API_HOSTPORT");
  }

  const privateOrigin = renderPrivateHost ? `http://${renderPrivateHost}` : undefined;
  const candidate = configured || privateOrigin || DEFAULT_DEAL_API_ORIGIN;
  if (renderPrivateHost && !/^[a-z0-9.-]+:\d+$/i.test(renderPrivateHost)) {
    throw new Error("DEAL_API_HOSTPORT must be a private hostname and port");
  }

  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== candidate.replace(/\/$/, "")) {
    throw new Error("DEAL_API_ORIGIN must be an exact http(s) origin without a path");
  }
  return parsed.origin;
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Keep production builds honest: TypeScript errors must fail the same build
  // artifact that will be deployed, even when a separate CI typecheck is missed.
  reactStrictMode: true,
  async headers() {
    const scriptPolicy = process.env.NODE_ENV === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const securityHeaders = [
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'` },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${dealApiOrigin()}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
