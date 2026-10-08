/**
 * Access-log redaction for credential-bearing URLs.
 *
 * The capability-link token IS the client's credential (anyone holding it can
 * act as the deal's client), so a share URL in an access log is a stored
 * secret. Logs keep the route shape for debugging but mask the token segment:
 *   /api/v1/shared/v5q7qX.../payments/verify -> /api/v1/shared/{redacted}/payments/verify
 */
const CAPABILITY_TOKEN_IN_PATH = /(\/shared\/)([^/?#\s]+)/g;

export function redactUrl(url: string): string {
  return url.replace(CAPABILITY_TOKEN_IN_PATH, '$1{redacted}');
}
