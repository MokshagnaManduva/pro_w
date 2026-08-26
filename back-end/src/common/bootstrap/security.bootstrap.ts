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
export function setupSecurity(_app: INestApplication): void {
  // V4: app.use(helmet()), app.use(compression()), body limits,
  //     app.enableCors({ origin: <allow-list> }), app.useStaticAssets(...).
}
