import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps every successful controller return value in the API envelope:
 * { "success": true, "data": ... }
 * (Errors take the mirrored shape produced by AllExceptionsFilter.)
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Binary streams are already a complete HTTP representation and must not
    // be JSON-wrapped (protected preview endpoint).
    return next.handle().pipe(map((data) => (data instanceof StreamableFile ? data : { success: true, data })));
  }
}
