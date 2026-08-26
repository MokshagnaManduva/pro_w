import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import type { IAuthedRequest } from '../contracts';

const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5);
const WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const SWEEP_EVERY_MS = 5 * 60 * 1000;

/**
 * V5 (v5-router-middleware) — ROUTE-LEVEL brute-force protection.
 *
 * Bound to exactly ONE route: POST /api/users/login. That is the textbook case
 * for route-scoped middleware — credential guessing deserves a far tighter
 * budget (5 per 15 min) than ordinary reads (V4's global 100/min), and
 * applying this budget anywhere else would break normal use of the app.
 *
 * Sliding window keyed by client IP, held in memory to match the rest of this
 * phase (no database yet).
 *
 * HONEST LIMITS, worth stating rather than overselling:
 *  - Per-process. Two instances behind a load balancer each get their own
 *    count, so the effective limit doubles.
 *  - Keyed by IP, so users behind one NAT share a budget, and an attacker with
 *    many IPs is barely slowed.
 *  - Lost on restart.
 * It raises the cost of naive guessing. It is not a replacement for account
 * lockout or MFA.
 */
@Injectable()
export class LoginRateLimitMiddleware implements NestMiddleware {
  private readonly attempts = new Map<string, number[]>();
  private lastSweep = Date.now();

  use(req: IAuthedRequest, res: Response, next: NextFunction): void {
    const key = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const now = Date.now();

    this.sweep(now);

    // Drop timestamps that have aged out of the window.
    const recent = (this.attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

    if (recent.length >= MAX_ATTEMPTS) {
      const retryAfterMs = WINDOW_MS - (now - recent[0]);
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));

      // Keep the record so hammering the endpoint does not reset the window.
      this.attempts.set(key, recent);

      throw new HttpException(
        {
          success: false,
          message: `Too many login attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
          data: null,
          code: 'TOO_MANY_REQUESTS',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.attempts.set(key, recent);
    next();
  }

  /** Periodically drop empty keys so the map cannot grow without bound. */
  private sweep(now: number): void {
    if (now - this.lastSweep < SWEEP_EVERY_MS) return;
    this.lastSweep = now;

    for (const [key, times] of this.attempts) {
      const live = times.filter((t) => now - t < WINDOW_MS);
      if (live.length === 0) this.attempts.delete(key);
      else this.attempts.set(key, live);
    }
  }
}
