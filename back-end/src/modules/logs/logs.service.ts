import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import type { ILogEntry, LogChannel } from '../../common/contracts';
import { listLogFiles, logFilePath } from '../../common/logging/log-rotation.util';

const VALID_CHANNELS: LogChannel[] = ['access', 'error', 'app'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIMIT = 1000;

/**
 * V1 (v1-logging) — read side of the logging layer.
 *
 * SECURITY NOTE: channel and date both feed into a filename, so both are
 * validated against a strict allow-list / pattern before they are used. A
 * value such as "../../.env" must never reach the filesystem — this is the
 * same path-traversal class of bug that V3 guards against for uploads.
 */
@Injectable()
export class LogsService {
  private readonly dir = process.env.LOG_DIR ?? 'logs';

  listFiles() {
    return listLogFiles(this.dir);
  }

  async read(
    channelRaw: string,
    dateRaw?: string,
    limitRaw?: number,
  ): Promise<{ channel: LogChannel; date: string; total: number; entries: ILogEntry[] }> {
    const channel = this.assertChannel(channelRaw);
    const date = this.assertDate(dateRaw);
    const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), MAX_LIMIT);

    let raw: string;
    try {
      raw = await fs.readFile(logFilePath(this.dir, channel, new Date(`${date}T00:00:00Z`)), 'utf8');
    } catch {
      return { channel, date, total: 0, entries: [] };
    }

    const lines = raw.split('\n').filter((l) => l.trim().length > 0);

    // Newest first, and only the tail — a day's access log can be large and we
    // do not want to ship all of it to a browser.
    const entries = lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line) as ILogEntry;
        } catch {
          // Never let one malformed line break the whole view.
          return { ts: '', message: line, level: 'warn' } as ILogEntry;
        }
      });

    return { channel, date, total: lines.length, entries };
  }

  private assertChannel(value: string): LogChannel {
    if (!VALID_CHANNELS.includes(value as LogChannel)) {
      throw new BadRequestException(
        `Invalid channel "${value}". Expected one of: ${VALID_CHANNELS.join(', ')}`,
      );
    }
    return value as LogChannel;
  }

  private assertDate(value?: string): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    if (!DATE_RE.test(value)) {
      throw new BadRequestException(`Invalid date "${value}". Expected YYYY-MM-DD.`);
    }
    return value;
  }
}
