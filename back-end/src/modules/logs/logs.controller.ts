import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { LogsService } from './logs.service';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * V1 (v1-logging) — superuser-only view onto the log files.
 *
 * Restricted to superuser: logs contain IPs, user agents and user ids, so this
 * is not something an ordinary account should be able to read.
 */
@ApiTags('Logs')
@Controller('logs')
@UseGuards(RoleGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('files')
  @ApiHeader({ name: 'role', required: true })
  @Roles('superuser')
  @ApiOperation({ summary: 'List available log files, newest first' })
  listFiles() {
    return this.logsService.listFiles();
  }

  @Get()
  @ApiHeader({ name: 'role', required: true })
  @Roles('superuser')
  @ApiOperation({ summary: 'Read log entries for a channel and date, newest first' })
  @ApiQuery({ name: 'channel', required: false, enum: ['access', 'error', 'app'] })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD, defaults to today' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max entries (default 200, cap 1000)' })
  read(
    @Query('channel') channel = 'access',
    @Query('date') date?: string,
    @Query('limit') limit?: number,
  ) {
    return this.logsService.read(channel, date, limit);
  }
}
