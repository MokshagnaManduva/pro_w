import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

/** V1 (v1-logging) — read-only API over the log files. */
@Module({
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule {}
