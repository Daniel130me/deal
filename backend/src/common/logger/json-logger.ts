import { getRequestId } from '../context/request-context';

type Level = 'log' | 'warn' | 'error';

/**
 * Emits one JSON object per line so logs stay queryable (grep/jq/ingest).
 * The request id is joined automatically via AsyncLocalStorage — callers never
 * pass it by hand.
 *
 * Discipline: callers must never include passwords, tokens, secrets or card
 * data in `message` or `extra` (agent.md security rule).
 */
export function logJson(
  level: Level,
  context: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const entry = {
    time: new Date().toISOString(),
    level,
    context,
    message,
    requestId: getRequestId(),
    ...extra,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
