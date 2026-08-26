import type { INestApplication } from '@nestjs/common';

/**
 * V2 (v2-error-handling) — OWNED BY THE ERROR-HANDLING LAYER.
 *
 * Process-level failure nets. These fire OUTSIDE any request, so no exception
 * filter can see them — without this the process can die with no record.
 *
 * main.ts is FROZEN — put your app-level setup here, not there.
 */
export function setupErrors(_app: INestApplication): void {
  // V2: process.on('unhandledRejection') / process.on('uncaughtException')
  //     → write to the error channel via FILE_LOGGER, then exit cleanly.
}
