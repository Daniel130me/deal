import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `fn` inside a request-scoped context. Called by RequestIdMiddleware so
 * every log line / error emitted anywhere deeper in the call chain can carry
 * the requestId without prop-drilling it through services.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The requestId of the HTTP request this code is serving, if any. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
