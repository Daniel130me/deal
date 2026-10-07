import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithRequestContext } from '../context/request-context';

/**
 * Assigns every request a correlation id, echoes it back as a response header,
 * and opens the AsyncLocalStorage request context used by the structured logger.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Trust an upstream id (proxy/LB) when present, but sanitise hard: ids land
    // in logs and response headers, so anything outside [A-Za-z0-9._-] is dropped.
    const incoming = req.header('x-request-id')?.replace(/[^\w.-]/g, '').slice(0, 128);
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();

    res.setHeader('x-request-id', requestId);
    runWithRequestContext({ requestId }, next);
  }
}
