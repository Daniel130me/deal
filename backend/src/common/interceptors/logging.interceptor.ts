import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { logJson } from '../logger/json-logger';

/**
 * One structured log line per SUCCESSFUL HTTP response (method, url, status, duration).
 * Failed requests are logged by AllExceptionsFilter instead — together that is
 * exactly one line per request, emitted by whichever component knows the outcome.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const startedAt = performance.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Math.round(performance.now() - startedAt);
        logJson('log', 'http', `${req.method} ${req.originalUrl} ${res.statusCode}`, {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          durationMs,
        });
      }),
    );
  }
}
