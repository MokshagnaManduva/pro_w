import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { config } from '../../config/configuration';

/**
 * V4 (v4-security) — module-scoped security providers.
 *
 * Application-level Express middleware (helmet, compression, CORS, static
 * serving) lives in bootstrap/security.bootstrap.ts, because it needs the app
 * instance and a module does not have one.
 *
 * The throttler is a baseline: it blunts scripted abuse across the whole API.
 * V5 adds a much stricter, route-scoped limiter on POST /users/login, because
 * credential guessing deserves a tighter budget than ordinary reads.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: config.throttle.ttlMs, limit: config.throttle.limit },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class SecurityModule {}
