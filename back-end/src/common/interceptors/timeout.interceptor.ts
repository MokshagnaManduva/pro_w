import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ErrorCode } from '../errors/error-codes';

const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 15_000);

/**
 * V2 (v2-error-handling) — bound how long a handler may run.
 *
 * WHY an interceptor and not middleware: middleware cannot see the handler's
 * result. An interceptor wraps the handler in an RxJS stream, which is what
 * makes a timeout expressible at all.
 *
 * Without this, a handler that hangs leaves the socket open indefinitely, the
 * client spins, and nothing is ever logged. With it the request fails loudly
 * as a 408 and goes through the normal filter, so it lands in the error log.
 *
 * HONEST LIMIT: this stops the *response* waiting, it does not cancel the work
 * already running server-side. Node cannot forcibly abort a synchronous
 * handler. It is a safety net for the client, not a kill switch.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(TIMEOUT_MS),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException({
                success: false,
                message: `Request exceeded the ${TIMEOUT_MS}ms time limit.`,
                data: null,
                code: ErrorCode.REQUEST_TIMEOUT,
              }),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
