import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { IAuthedRequest } from '../contracts';

/**
 * V5 (v5-router-middleware) — role enforcement.
 *
 * THE CHANGE THAT MATTERS: this used to read request.headers['role'].
 * That header is client-supplied, so `curl -H 'role: superuser'` was full
 * administrator access on every guarded route in the application. It now reads
 * req.user, which AuthMiddleware populates ONLY after verifying V4's HMAC
 * signature — a value the client cannot forge.
 *
 * WHY THIS IS A GUARD AND NOT MIDDLEWARE:
 * it needs the @Roles() metadata attached to the handler, and reading that
 * requires Reflector + ExecutionContext. Neither exists during the middleware
 * phase, because Nest has not yet resolved which handler will run. Middleware
 * authenticates (who are you); the guard authorises (may you do this).
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() on the handler: this route is not role-restricted.
    // Authentication is still enforced separately by AuthMiddleware.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<IAuthedRequest>();
    const user = request.user;

    if (!user) {
      // Reaching here means a role-restricted route was not covered by
      // AuthMiddleware. That is a wiring mistake in RoutingModule, so fail
      // closed and say so rather than silently allowing the request.
      throw new ForbiddenException({
        success: false,
        message: 'Authentication required for this action.',
        data: null,
        code: 'UNAUTHORIZED',
      });
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        success: false,
        message: `Access denied. Required role(s): ${requiredRoles.join(', ')}. Your role: ${user.role}`,
        data: null,
        code: 'FORBIDDEN',
      });
    }

    return true;
  }
}
