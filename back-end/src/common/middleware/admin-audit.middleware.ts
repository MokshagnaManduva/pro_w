import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import { FILE_LOGGER, type IFileLogger, type IAuthedRequest } from '../contracts';

/**
 * V5 (v5-router-middleware) — ROUTER-LEVEL audit trail for privileged actions.
 *
 * Bound only to the routes that can destroy or reshape data: seed reset, user
 * deletion, expert-application decisions. Ordinary reads are already covered
 * by V1's access log; auditing them again would bury the few records that
 * actually matter.
 *
 * Records the OUTCOME, not just the attempt — it logs on res.finish so a
 * rejected 403 is distinguishable from a completed action. An audit trail that
 * cannot tell those apart is close to useless.
 */
@Injectable()
export class AdminAuditMiddleware implements NestMiddleware {
  constructor(@Inject(FILE_LOGGER) private readonly fileLogger: IFileLogger) {}

  use(req: IAuthedRequest, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const { method, originalUrl } = req;

    res.on('finish', () => {
      const succeeded = res.statusCode >= 200 && res.statusCode < 400;

      this.fileLogger.write('app', {
        ts: new Date().toISOString(),
        level: succeeded ? 'info' : 'warn',
        requestId: req.requestId,
        event: 'admin.action',
        // Identity comes from the verified token, never from a header — the
        // whole point of an audit record is that it cannot be forged.
        actor: req.user?.userId ?? 'anonymous',
        role: req.user?.role ?? '-',
        action: `${method} ${originalUrl}`,
        target: extractTarget(originalUrl),
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: req.ip ?? req.socket?.remoteAddress ?? '-',
        message: succeeded ? 'privileged action completed' : 'privileged action rejected',
      });
    });

    next();
  }
}

/** Best-effort id of the thing being acted on, for readable audit records. */
function extractTarget(url: string): string | null {
  const clean = url.split('?')[0].replace(/\/$/, '');
  const segments = clean.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  // Ignore verb-like trailing segments so "users/u4" reports u4, not "status".
  if (!last || ['reset', 'status', 'approve', 'decline'].includes(last)) {
    return segments[segments.length - 2] ?? null;
  }
  return last;
}
