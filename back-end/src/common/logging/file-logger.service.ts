import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import {
  REDACTED_KEYS,
  REDACTED_VALUE,
  type IFileLogger,
  type ILogEntry,
  type LogChannel,
} from '../contracts';
import { dateStamp, logFilePath, sweepOldLogs } from './log-rotation.util';

const CHANNELS: LogChannel[] = ['access', 'error', 'app'];

/**
 * V1 (v1-logging) — buffered, interval-flushed log writer.
 *
 * WHY BUFFER instead of writing on every request?
 * Appending to disk per request adds a syscall and I/O latency to every single
 * response. Buffering in memory and flushing on a timer amortises that cost —
 * and it is literally what the brief asks for: "logs stored in files at
 * regular intervals".
 *
 * THE TRADE-OFF, stated honestly: a hard crash loses whatever is still in the
 * buffer, up to one flush interval. Three things narrow that window:
 *   1. a size-threshold flush (LOG_BUFFER_LIMIT) for bursts,
 *   2. onModuleDestroy, which Nest calls on SIGINT/SIGTERM via shutdown hooks,
 *   3. a beforeExit hook wired in logging.bootstrap.ts.
 * Anything stronger (fsync per line) would defeat the point of buffering.
 */
@Injectable()
export class FileLoggerService implements IFileLogger, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('FileLogger');

  private readonly buffers: Record<LogChannel, ILogEntry[]> = {
    access: [],
    error: [],
    app: [],
  };

  private timer: NodeJS.Timeout | null = null;
  /** Guards against overlapping flushes if disk is slower than the interval. */
  private flushing = false;
  private lastSweepDate = '';

  private readonly dir = process.env.LOG_DIR ?? 'logs';
  private readonly flushMs = Number(process.env.LOG_FLUSH_MS ?? 10_000);
  private readonly bufferLimit = Number(process.env.LOG_BUFFER_LIMIT ?? 100);
  private readonly retentionDays = Number(process.env.LOG_RETENTION_DAYS ?? 7);

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });

    // unref() so a pending timer never holds the process open on shutdown.
    this.timer = setInterval(() => void this.flush(), this.flushMs);
    this.timer.unref();

    await this.sweep();
    this.logger.log(
      `Writing to ${this.dir}/ — flushing every ${this.flushMs}ms, ` +
        `retaining ${this.retentionDays} days`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush(); // final drain — do not lose the tail on shutdown
  }

  /**
   * Queue an entry. Never touches disk, so it is safe to call from a hot path
   * such as res.on('finish').
   */
  write(channel: LogChannel, entry: ILogEntry): void {
    // Spread first, then set ts — the other order lets an undefined entry.ts
    // overwrite the default and produce a record with no timestamp.
    const record: ILogEntry = {
      ...entry,
      ts: entry.ts ?? new Date().toISOString(),
    };

    this.buffers[channel].push(redact(record) as ILogEntry);

    // Burst protection: flush early rather than growing without bound.
    if (this.buffers[channel].length >= this.bufferLimit) {
      void this.flush();
    }
  }

  /** Force a flush now. Safe to call concurrently — overlapping calls no-op. */
  async flush(): Promise<void> {
    if (this.flushing) return;

    // Drain synchronously BEFORE any await. Entries written during the awaits
    // below land in the fresh array and are picked up by the next flush, so
    // nothing is dropped and nothing is written twice.
    const pending: Array<[LogChannel, ILogEntry[]]> = [];
    for (const channel of CHANNELS) {
      if (this.buffers[channel].length > 0) {
        pending.push([channel, this.buffers[channel].splice(0)]);
      }
    }
    if (pending.length === 0) return;

    this.flushing = true;
    try {
      const now = new Date();
      for (const [channel, entries] of pending) {
        // JSONL: one JSON object per line — greppable, and streamable back out.
        const payload = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
        try {
          await fs.appendFile(logFilePath(this.dir, channel, now), payload, 'utf8');
        } catch (err) {
          // Put them back so the next flush retries rather than silently losing
          // them, then report to the console — the only sink we have left.
          this.buffers[channel].unshift(...entries);
          this.logger.error(
            `Failed writing ${entries.length} ${channel} entries: ${String(err)}`,
          );
        }
      }
      await this.sweep(now);
    } finally {
      this.flushing = false;
    }
  }

  /** Retention sweep, at most once per UTC day. */
  private async sweep(now: Date = new Date()): Promise<void> {
    const today = dateStamp(now);
    if (this.lastSweepDate === today) return;
    this.lastSweepDate = today;

    const removed = await sweepOldLogs(this.dir, this.retentionDays);
    if (removed.length > 0) {
      this.logger.log(`Retention sweep removed ${removed.length} old log file(s)`);
    }
  }
}

/**
 * Replace secret values anywhere in the record, at any depth.
 *
 * Centralised here rather than at each call site so that V2's error logging
 * inherits it automatically — a failed login must never write a plaintext
 * password into a file that later gets committed or shared.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = (REDACTED_KEYS as readonly string[]).includes(k.toLowerCase())
      ? REDACTED_VALUE
      : redact(v, depth + 1);
  }
  return out;
}
