import type { INestApplication } from '@nestjs/common';

/**
 * V1 (v1-logging) — OWNED BY THE LOGGING LAYER.
 *
 * Bootstrap hook for anything that must run against the app instance rather
 * than inside a module: process-level log wiring, shutdown flush hooks.
 *
 * main.ts is FROZEN — put your app-level setup here, not there.
 */
export function setupLogging(_app: INestApplication): void {
  // V1: resolve FileLoggerService and flush its buffer on SIGINT / SIGTERM.
}
