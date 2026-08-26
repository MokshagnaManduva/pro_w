import type { ILogEntry, LogChannel } from './log-entry.interface';

/**
 * Buffered, interval-flushed log writer — FROZEN CONTRACT (V0).
 *
 * V1 owns the real implementation. V2 injects this to persist errors.
 * Inject with @Inject(FILE_LOGGER) so neither layer depends on the other's class.
 */
export interface IFileLogger {
  /** Queue an entry. Never touches disk synchronously. */
  write(channel: LogChannel, entry: ILogEntry): void;
  /** Force a flush now (shutdown, tests, size threshold). */
  flush(): Promise<void>;
}

/** DI token — use instead of the concrete class to keep layers decoupled. */
export const FILE_LOGGER = Symbol('FILE_LOGGER');
