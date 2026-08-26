import { Injectable, NestMiddleware, Logger, Inject } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import { FILE_LOGGER, type IFileLogger, type IAuthedRequest } from '../contracts';

/**
 * V1 (v1-logging) — APPLICATION-level HTTP logger.
 *
 * Dual sink: a coloured line to the console for live development, and a
 * structured JSON record into the buffered file logger for persistence.
 *
 * Note it does not log on the way IN. It registers a res.on('finish') callback
 * and logs on the way OUT, because status, duration and response size are only
 * known once the response has been sent.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(@Inject(FILE_LOGGER) private readonly fileLogger: IFileLogger) {}

  use(req: IAuthedRequest, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const startTime = Date.now();

    // Prefer the proxy-aware client address, falling back to the socket.
    const ip = req.ip ?? req.socket?.remoteAddress ?? '-';
    const userAgent = req.get('user-agent') ?? '';

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const contentLength = Number(res.get('content-length') ?? 0);

      // Identity: prefer the verified token payload that V5's AuthMiddleware
      // attaches. The legacy headers are a fallback for the pre-V4 client and
      // are NOT trustworthy — they are logged for diagnostics only.
      const role = req.user?.role ?? req.get('role') ?? '-';
      const userId = req.user?.userId ?? req.get('user-id') ?? '-';

      this.logger.log(
        `${colourMethod(method)} ${originalUrl} ` +
          `${colourStatus(statusCode)} ` +
          `${duration}ms - ${contentLength}b ` +
          `[role: ${role}, user: ${userId}]`,
      );

      const entry = {
        ts: new Date().toISOString(),
        requestId: req.requestId,
        method,
        url: originalUrl,
        status: statusCode,
        durationMs: duration,
        bytes: contentLength,
        ip,
        userAgent,
        role,
        userId,
      };

      this.fileLogger.write('access', entry);

      // Failures also go to the error channel, so investigating an incident
      // means grepping one small file rather than the full access log. V2 adds
      // the stack trace and request body to its own error records.
      if (statusCode >= 400) {
        this.fileLogger.write('error', {
          ...entry,
          level: statusCode >= 500 ? 'error' : 'warn',
          message: `HTTP ${statusCode} on ${method} ${originalUrl}`,
        });
      }
    });

    next();
  }
}

// ── Console colouring (development readability only) ────────────────────────
const RESET = '\x1b[0m';

const METHOD_COLOURS: Record<string, string> = {
  GET: '\x1b[92m',
  POST: '\x1b[93m',
  PATCH: '\x1b[94m',
  PUT: '\x1b[96m',
  DELETE: '\x1b[91m',
};

function colourMethod(method: string): string {
  return `${METHOD_COLOURS[method] ?? RESET}${method}${RESET}`;
}

function colourStatus(status: number): string {
  const colour =
    status >= 500 ? '\x1b[31m'
    : status >= 400 ? '\x1b[33m'
    : status >= 300 ? '\x1b[36m'
    : '\x1b[32m';
  return `${colour}${status}${RESET}`;
}
