import type { INestApplication } from '@nestjs/common';
import { FILE_LOGGER, type IFileLogger } from '../contracts';

/**
 * V1 (v1-logging) — process-level log wiring.
 *
 * Nest's enableShutdownHooks() already calls FileLoggerService.onModuleDestroy
 * on SIGINT/SIGTERM, which flushes the buffer. This adds a belt-and-braces
 * beforeExit flush for the paths that do not raise a signal — for example the
 * event loop simply draining.
 *
 * Neither of these can save a hard kill (SIGKILL) or a power loss. That
 * residual risk is inherent to buffering and is documented in
 * FileLoggerService.
 */
export function setupLogging(app: INestApplication): void {
  const fileLogger = app.get<IFileLogger>(FILE_LOGGER);

  fileLogger.write('app', {
    ts: new Date().toISOString(),
    level: 'info',
    event: 'app.startup',
    action: 'bootstrap',
    target: null,
  });

  process.on('beforeExit', () => {
    void fileLogger.flush();
  });
}
