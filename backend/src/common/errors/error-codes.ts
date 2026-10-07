/**
 * HTTP status -> machine-readable error code mapping for the response envelope.
 * Domain-specific codes (e.g. DEAL_NOT_FOUND) are thrown explicitly by services
 * in later phases and pass through the filter untouched; this map only covers
 * framework-level failures.
 */
const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

export function codeForStatus(status: number): string {
  return STATUS_TO_CODE[status] ?? `HTTP_${status}`;
}
