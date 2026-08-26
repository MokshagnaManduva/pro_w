import { promises as fs } from 'fs';
import { join } from 'path';
import type { LogChannel } from '../contracts';

/**
 * V1 (v1-logging) — date-stamped log filenames and retention sweeping.
 *
 * Rotation is by filename, not by renaming files: the name is derived from the
 * date at write time, so crossing midnight simply starts appending to a new
 * file. Nothing has to move, and a crash can never lose a half-rotated file.
 */

/** UTC date as YYYY-MM-DD. UTC, not local, so log names do not shift with DST. */
export function dateStamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** e.g. "access-2026-08-26.log" */
export function logFileName(channel: LogChannel, d: Date = new Date()): string {
  return `${channel}-${dateStamp(d)}.log`;
}

export function logFilePath(dir: string, channel: LogChannel, d: Date = new Date()): string {
  return join(dir, logFileName(channel, d));
}

/** Matches the files this layer creates, and captures the date portion. */
const LOG_FILE_RE = /^(access|error|app)-(\d{4}-\d{2}-\d{2})\.log$/;

export function parseLogFileName(
  name: string,
): { channel: LogChannel; date: string } | null {
  const m = LOG_FILE_RE.exec(name);
  return m ? { channel: m[1] as LogChannel, date: m[2] } : null;
}

/**
 * Delete log files older than retentionDays. Returns the names removed.
 * Only touches files matching our own naming pattern — never deletes anything
 * else that happens to be sitting in the log directory.
 */
export async function sweepOldLogs(dir: string, retentionDays: number): Promise<string[]> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return [];

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const cutoffStamp = dateStamp(cutoff);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return []; // directory not created yet — nothing to sweep
  }

  const removed: string[] = [];
  for (const name of entries) {
    const parsed = parseLogFileName(name);
    // Lexicographic comparison is safe: YYYY-MM-DD sorts chronologically.
    if (parsed && parsed.date < cutoffStamp) {
      try {
        await fs.unlink(join(dir, name));
        removed.push(name);
      } catch {
        // Best effort — a locked or already-removed file must not break logging.
      }
    }
  }
  return removed;
}

/** List our log files, newest first. Used by the logs read API. */
export async function listLogFiles(
  dir: string,
): Promise<Array<{ name: string; channel: LogChannel; date: string; size: number }>> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const out: Array<{ name: string; channel: LogChannel; date: string; size: number }> = [];
  for (const name of entries) {
    const parsed = parseLogFileName(name);
    if (!parsed) continue;
    try {
      const stat = await fs.stat(join(dir, name));
      out.push({ name, channel: parsed.channel, date: parsed.date, size: stat.size });
    } catch {
      // File vanished between readdir and stat — skip it.
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.channel.localeCompare(b.channel) : b.date.localeCompare(a.date)));
}
