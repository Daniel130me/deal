import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { codeForStatus } from '../errors/error-codes';
import { logJson } from '../logger/json-logger';
import { redactUrl } from '../logger/redact';

interface ErrorBody {
  code: string;
  message: string;
}

interface DescribedError {
  status: number;
  body: ErrorBody;
}

/**
 * Extracts a safe {code, message} pair from any thrown value.
 * - Domain errors thrown as `new HttpException({ code, message }, status)` keep their code.
 * - ValidationPipe errors (`message: string[]`) collapse to one readable message.
 * - Unknown errors become 500 INTERNAL_ERROR — the real cause is logged, never returned.
 */
function describeError(exception: unknown): DescribedError {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();

    let message: string;
    let code: string | undefined;
    if (typeof response === 'string') {
      message = response;
    } else if (Array.isArray((response as { message?: unknown }).message)) {
      message = 'Validation failed';
    } else {
      const body = response as { message?: string; code?: string };
      message = body.message ?? exception.message;
      code = typeof body.code === 'string' ? body.code : undefined;
    }

    return {
      status,
      body: { code: code ?? codeForStatus(status), message },
    };
  }

  logJson('error', 'http', 'Unhandled exception', {
    cause: exception instanceof Error ? exception.message : String(exception),
    stack: exception instanceof Error ? exception.stack : undefined,
  });
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };
}

/**
 * Global exception filter enforcing the API error envelope:
 * { "success": false, "error": { "code": "...", "message": "..." } }
 * No stack traces or internals ever reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, body } = describeError(exception);

    if (status >= 400) {
      logJson(status >= 500 ? 'error' : 'warn', 'http', `${req.method} ${redactUrl(req.originalUrl)} -> ${status} ${body.code}`, {
        method: req.method,
        url: redactUrl(req.originalUrl),
        status,
        code: body.code,
      });
    }

    res.status(status).json({ success: false, error: body });
  }
}
