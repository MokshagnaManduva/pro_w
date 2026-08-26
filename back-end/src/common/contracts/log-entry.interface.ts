/**
 * Shared log record schema — FROZEN CONTRACT (V0).
 *
 * V1 (logging) writes access + app records; V2 (error handling) writes error
 * records. Both append to the same files, so this shape must not change on a
 * layer branch. See Middleware-Documentation.md, Part E.
 */

/** Which log file an entry is routed to. */
export type LogChannel = 'access' | 'error' | 'app';

export type LogLevel = 'info' | 'warn' | 'error';

/** One line in a .log file, serialised as JSON (JSONL format). */
export interface ILogEntry {
  /** ISO-8601 UTC timestamp. */
  ts: string;
  level?: LogLevel;
  /** Correlation id shared with the X-Request-Id response header. */
  requestId?: string;

  // ── HTTP context (access + error) ────────────────────────────────────────
  method?: string;
  url?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  bytes?: number;
  ip?: string;
  userAgent?: string;

  // ── Identity ─────────────────────────────────────────────────────────────
  role?: string;
  userId?: string;

  // ── Failure detail (error channel) ───────────────────────────────────────
  message?: string;
  stack?: string;
  /** Request body with secrets replaced by REDACTED. */
  body?: Record<string, unknown>;

  // ── Audit / lifecycle (app channel) ──────────────────────────────────────
  event?: string;
  actor?: string;
  action?: string;
  target?: string | null;

  [key: string]: unknown;
}

/** Fields that must never be written to a log file in plaintext. */
export const REDACTED_KEYS = ['password', 'token', 'authorization', 'accessToken'] as const;
export const REDACTED_VALUE = '[REDACTED]';
