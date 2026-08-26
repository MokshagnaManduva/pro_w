import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { FILE_LOGGER, type IFileLogger } from '../contracts';

/**
 * V2 (v2-error-handling) — process-level failure nets.
 *
 * WHY these exist: unhandledRejection and uncaughtException fire OUTSIDE any
 * request. There is no ArgumentsHost, so no exception filter can ever see
 * them. Without these hooks the process can die leaving nothing behind but an
 * empty terminal — the single worst debugging experience there is.
 */
export function setupErrors(app: INestApplication): void {
  const fileLogger = app.get<IFileLogger>(FILE_LOGGER);
  const logger = new Logger('ProcessError');

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`Unhandled promise rejection: ${err.message}`, err.stack);
    fileLogger.write('error', {
      ts: new Date().toISOString(),
      level: 'error',
      event: 'process.unhandledRejection',
      message: err.message,
      stack: err.stack,
    });
    // Deliberately NOT exiting. An unhandled rejection is usually one broken
    // request, and killing a working server over it is worse than logging it.
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error(`Uncaught exception: ${err.message}`, err.stack);
    fileLogger.write('error', {
      ts: new Date().toISOString(),
      level: 'error',
      event: 'process.uncaughtException',
      message: err.message,
      stack: err.stack,
    });

    // This one IS fatal. After an uncaught exception the process is in an
    // undefined state and may corrupt data if left running. Flush first so the
    // evidence survives, then exit non-zero for the supervisor to restart.
    void fileLogger
      .flush()
      .catch(() => undefined)
      .finally(() => process.exit(1));
  });
}
