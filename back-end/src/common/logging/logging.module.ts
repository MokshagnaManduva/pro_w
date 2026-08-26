import { Global, Module } from '@nestjs/common';
import { FILE_LOGGER } from '../contracts';
import { FileLoggerService } from './file-logger.service';

/**
 * V1 (v1-logging) — OWNED BY THE LOGGING LAYER.
 *
 * @Global so any layer can inject FILE_LOGGER without importing this module.
 * That is deliberate: V2 needs the logger, and we do not want a module-import
 * edge between two people's branches.
 *
 * V1 adds here: LoggerMiddleware, RequestIdMiddleware (as an APP-level
 * consumer.apply in this module's configure()), and the logs read-API module.
 */
@Global()
@Module({
  providers: [
    FileLoggerService,
    { provide: FILE_LOGGER, useExisting: FileLoggerService },
  ],
  exports: [FILE_LOGGER, FileLoggerService],
})
export class LoggingModule {}
