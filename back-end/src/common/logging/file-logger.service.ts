import { Injectable } from '@nestjs/common';
import type { IFileLogger, ILogEntry, LogChannel } from '../contracts';

/**
 * V0 STUB — console passthrough. V1 (v1-logging) REPLACES THIS BODY.
 *
 * Exists so V2 can inject FILE_LOGGER and build error persistence on day one,
 * without waiting for V1 to merge. The IFileLogger contract is frozen; the
 * implementation behind it is not.
 *
 * V1 replaces this with: in-memory buffers per channel, a setInterval flush,
 * daily-rotated files under logs/, a size-threshold force-flush, and a
 * shutdown flush. Do not change the method signatures.
 */
@Injectable()
export class FileLoggerService implements IFileLogger {
  write(channel: LogChannel, entry: ILogEntry): void {
    // V0: no file I/O yet — visible in the console so layers can verify wiring.
    console.log(`[${channel}]`, JSON.stringify(entry));
  }

  async flush(): Promise<void> {
    // V0: nothing is buffered, so there is nothing to flush.
  }
}
