import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response, NextFunction } from 'express';
import type { IAuthedRequest } from '../contracts';

/**
 * V1 (v1-logging) — correlation ID for every request.
 *
 * WHY: without it there is no way to tie the error a user saw to the line in
 * the log file that explains it. With it, the id in the X-Request-Id response
 * header appears on every log record for that request — access and error alike.
 *
 * Must run BEFORE LoggerMiddleware, which reads req.requestId.
 * See LoggingModule.configure().
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: IAuthedRequest, res: Response, next: NextFunction): void {
    // Honour an inbound id if a caller (or a future gateway) already set one,
    // so a trace can span more than this service. Otherwise mint a new one.
    const inbound = req.get('x-request-id');
    req.requestId = isSafeRequestId(inbound) ? (inbound as string) : randomUUID();

    res.setHeader('X-Request-Id', req.requestId);
    next();
  }
}

/**
 * Never reflect an unvalidated header straight back into a response — that is
 * a header-injection vector. Accept only a conservative id shape.
 */
function isSafeRequestId(value: string | undefined): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(value);
}
