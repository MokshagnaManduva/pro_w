import { Module } from '@nestjs/common';

/**
 * V4 (v4-security) — OWNED BY THE SECURITY LAYER.
 *
 * Register security providers HERE, not in app.module.ts (FROZEN):
 *
 *   imports:   [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])]
 *   providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
 *
 * Application-level Express middleware (helmet, compression, CORS, static
 * serving) goes in bootstrap/security.bootstrap.ts instead — it needs the app
 * instance, which a module does not have.
 */
@Module({})
export class SecurityModule {}
