import { Module } from '@nestjs/common';

/**
 * V5 (v5-router-middleware) — OWNED BY THE ROUTER-LEVEL LAYER.
 *
 * THIS is where the router-level middleware requirement is satisfied. Implement
 * NestModule and bind each middleware to specific routes:
 *
 *   export class RoutingModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer) {
 *       consumer.apply(AuthMiddleware)
 *         .exclude(
 *           { path: 'api/users/login', method: RequestMethod.POST },
 *           { path: 'api/users',       method: RequestMethod.POST },
 *         )
 *         .forRoutes(UsersController, TasksController, ...);
 *
 *       consumer.apply(LoginRateLimitMiddleware)
 *         .forRoutes({ path: 'api/users/login', method: RequestMethod.POST });
 *
 *       consumer.apply(UploadGuardMiddleware)
 *         .forRoutes({ path: 'api/uploads/*path', method: RequestMethod.ALL });
 *
 *       consumer.apply(AdminAuditMiddleware).forRoutes(...);
 *     }
 *   }
 *
 * Bind the upload guard by PATH STRING, not by importing UploadsController —
 * that keeps V5 and V3 from referencing each other's code.
 */
@Module({})
export class RoutingModule {}
