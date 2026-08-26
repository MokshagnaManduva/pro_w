import type { INestApplication } from '@nestjs/common';

/**
 * V4 (v4-security) — OWNED BY THE SECURITY LAYER.
 *
 * Application-level Express middleware: helmet, compression, body-size limits,
 * the CORS allow-list, and static serving of uploads/ behind a traversal guard.
 *
 * Reminder (Middleware-Documentation.md A5): middleware registered here with
 * app.use() is plain Express and runs OUTSIDE Nest's exception filters, so it
 * must handle its own errors.
 *
 * main.ts is FROZEN — put your app-level setup here, not there.
 */
export function setupSecurity(app: INestApplication): void {
  // Permissive placeholder so the front-end keeps working until V4 lands.
  // V4 REPLACES this with an explicit allow-list read from ALLOWED_ORIGINS.
  // CORS lives here, not in main.ts: main.ts runs its body after these hooks,
  // so anything it set would override whatever this function configures.
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Request-Id, role, user-id',
  });
}
