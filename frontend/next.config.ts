import type { NextConfig } from "next";
import { dealApiOrigin } from "./src/lib/server/deal-api-origin";

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
