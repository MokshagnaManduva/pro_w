import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import type { IAuthedRequest } from '../contracts';
import { verifyToken } from '../security/token.util';

/**
 * V5 (v5-router-middleware) — ROUTER-LEVEL authentication.
 *
 * Verifies the signed token from V4 and attaches the payload to req.user.
 * Everything downstream (RoleGuard, LoggerMiddleware, AdminAuditMiddleware)
 * reads identity from there rather than from a header.
 *
 * WHY THIS IS MIDDLEWARE AND NOT A GUARD — a common viva question:
 * this step only needs the raw request (read a header, verify a signature,
 * attach a result). It needs no knowledge of which handler is about to run.
 * RoleGuard is the opposite: it must read the @Roles() metadata off the
 * handler, which requires an ExecutionContext and Reflector — and those only
 * exist from the guard phase onwards. Middleware runs first, so req.user is
 * already populated by the time the guard looks for it.
 *
 * Bound per-router in RoutingModule with .exclude() for login and signup.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: IAuthedRequest, _res: Response, next: NextFunction): void {
    const token = readBearer(req.headers.authorization);
    // Guarded rather than passing null straight through: the V0 stub types
    // verifyToken as (string), while V4 widens it to (string | null). Checking
    // here keeps this branch building against either.
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      // Deliberately NOT falling back to the legacy `role` header. That header
      // is exactly the vulnerability this layer exists to close: before V4/V5,
      // `curl -H 'role: superuser'` was full admin. Accepting it "just for
      // compatibility" would reopen the hole.
      throw new UnauthorizedException({
        success: false,
        message: 'Authentication required. Sign in to continue.',
        data: null,
        code: 'UNAUTHORIZED',
      });
    }

    req.user = payload;
    next();
  }
}

/**
 * Parse `Authorization: Bearer <token>`.
 *
 * Deliberately implemented here rather than imported from the security layer:
 * the shared contract (src/common/contracts) promises verifyToken and the
 * ITokenPayload shape, nothing else. Depending on an incidental helper from
 * another branch would couple the two layers in a way the contract never
 * sanctioned — and would stop this branch building on its own.
 */
function readBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
