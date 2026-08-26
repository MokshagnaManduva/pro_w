import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { LoginRateLimitMiddleware } from '../middleware/login-rate-limit.middleware';
import { UploadGuardMiddleware } from '../middleware/upload-guard.middleware';
import { AdminAuditMiddleware } from '../middleware/admin-audit.middleware';

/**
 * V5 (v5-router-middleware) — THIS is where the router-level middleware
 * requirement is satisfied.
 *
 * The distinction that matters:
 *   APPLICATION-level  forRoutes('*')          — every request, no exceptions.
 *                                                V1's logger lives there.
 *   ROUTER-level       forRoutes(<specific>)   — bound to particular routers,
 *                                                routes and HTTP methods, with
 *                                                carve-outs via .exclude().
 *
 * Everything below is the second kind. Each middleware is scoped as tightly as
 * its purpose allows, and the scoping is itself the design decision:
 *
 *   AuthMiddleware       all data routers, EXCEPT login and signup
 *   LoginRateLimit       exactly one route: POST /api/users/login
 *   UploadGuard          api/uploads/* only, before multer runs
 *   AdminAudit           only the routes that destroy or reshape data
 *
 * NOTE ON PATHS: paths here are matched WITHOUT the global 'api' prefix that
 * main.ts sets, and Express 5 (path-to-regexp v8) requires named wildcards —
 * '*splat', not a bare '*'. Both were verified against the running app rather
 * than assumed; getting either wrong silently binds nothing, which is the
 * worst possible failure mode for a security control.
 */
@Module({})
export class RoutingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // ── Authentication ────────────────────────────────────────────────────
    // Applied to every data router. The two exclusions are the routes that
    // CREATE a session — requiring a token to log in would be a deadlock.
    consumer
      .apply(AuthMiddleware)
      .exclude(
        { path: 'users/login', method: RequestMethod.POST },
        { path: 'users', method: RequestMethod.POST }, // signup
      )
      .forRoutes(
        'users',
        'tasks',
        'milestones',
        'proposals',
        'audit-requests',
        'audit-reports',
        'disputes',
        'transactions',
        'expert-applications',
        'notifications',
        'messages',
        'seed',
        'logs',
        'uploads',
      );

    // ── Brute-force protection, single route ──────────────────────────────
    // Deliberately NOT global: 5 attempts per 15 minutes would make the app
    // unusable if applied to reads. Credential guessing is the only thing that
    // warrants a budget this tight.
    consumer
      .apply(LoginRateLimitMiddleware)
      .forRoutes({ path: 'users/login', method: RequestMethod.POST });

    // ── Upload pre-flight ─────────────────────────────────────────────────
    // Bound by path string, not by importing V3's UploadsController, so the
    // two branches never reference each other's code.
    consumer
      .apply(UploadGuardMiddleware)
      .forRoutes({ path: 'uploads/*splat', method: RequestMethod.ALL });

    // ── Audit trail for privileged actions ────────────────────────────────
    consumer
      .apply(AdminAuditMiddleware)
      .forRoutes(
        { path: 'seed/reset', method: RequestMethod.POST },
        { path: 'users/:id', method: RequestMethod.DELETE },
        { path: 'expert-applications/:id/status', method: RequestMethod.PATCH },
        { path: 'disputes/:id/resolve', method: RequestMethod.POST },
      );
  }
}
