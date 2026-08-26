import type { INestApplication } from '@nestjs/common';

/**
 * V5 (v5-router-middleware) — OWNED BY THE ROUTER-LEVEL LAYER.
 *
 * Most of V5's work is router-level and belongs in RoutingModule.configure()
 * via consumer.apply(...).forRoutes(...). This hook exists for anything that
 * genuinely needs the app instance instead.
 *
 * main.ts is FROZEN — put your app-level setup here, not there.
 */
export function setupRouting(_app: INestApplication): void {
  // V5: reserved. Prefer RoutingModule.configure() for route-scoped middleware.
}
