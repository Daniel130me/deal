const DEFAULT_DEAL_API_ORIGIN = "http://localhost:3001";

type Environment = Record<string, string | undefined>;

/**
 * Resolve and validate the private API origin used by the Next server.
 * Keeping this in one server-only module prevents the rewrite and readiness
 * endpoint from drifting to different upstream services.
 */
export function dealApiOrigin(environment: Environment = process.env): string {
  const configured = environment.DEAL_API_ORIGIN?.trim();
  const renderPrivateHost = environment.DEAL_API_HOSTPORT?.trim();

  if (configured && renderPrivateHost) {
    throw new Error("Set only one of DEAL_API_ORIGIN or DEAL_API_HOSTPORT");
  }
  if (renderPrivateHost && !/^[a-z0-9.-]+:\d+$/i.test(renderPrivateHost)) {
    throw new Error("DEAL_API_HOSTPORT must be a private hostname and port");
  }

  const privateOrigin = renderPrivateHost ? `http://${renderPrivateHost}` : undefined;
  const candidate = configured || privateOrigin || DEFAULT_DEAL_API_ORIGIN;
  const parsed = new URL(candidate);

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== candidate.replace(/\/$/, "")
  ) {
    throw new Error("DEAL_API_ORIGIN must be an exact http(s) origin without a path");
  }

  return parsed.origin;
}
