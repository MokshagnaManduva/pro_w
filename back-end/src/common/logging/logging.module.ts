import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { FILE_LOGGER } from '../contracts';
import { FileLoggerService } from './file-logger.service';
import { LoggerMiddleware } from '../middleware/logger.middleware';

/**
 * V1 (v1-logging) — OWNED BY THE LOGGING LAYER.
 *
 * @Global so any layer can inject FILE_LOGGER without importing this module.
 * That is deliberate: V2 needs the logger, and we do not want a module-import
 * edge between two people's branches.
 *
 * This module also owns ALL APPLICATION-level middleware — the kind that runs
 * on every route via forRoutes('*'). app.module.ts is frozen and has no
 * configure() of its own.
 *
 * ROUTER-level middleware (scoped to specific controllers/routes) is a
 * different concern and belongs to V5 in RoutingModule.
 */
@Global()
@Module({
  providers: [
    FileLoggerService,
    { provide: FILE_LOGGER, useExisting: FileLoggerService },
  ],
  exports: [FILE_LOGGER, FileLoggerService],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // V1: add RequestIdMiddleware BEFORE LoggerMiddleware — the logger reads
    // req.requestId, so the id must already exist. Arguments to apply() run in
    // the order given.
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
