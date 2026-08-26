import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * V4 (v4-security) — typed configuration with safe defaults.
 *
 * Everything security-relevant reads from here rather than from a literal
 * buried in code, so a reviewer can see the whole security posture in one file.
 */
const logger = new Logger('Config');

function requiredSecret(): string {
  const fromEnv = process.env.TOKEN_SECRET;

  if (fromEnv && fromEnv.length >= 32 && fromEnv !== 'change-me-in-your-local-env-file') {
    return fromEnv;
  }

  // Deliberately NOT falling back to a hardcoded constant. A committed default
  // secret is worse than no secret: it looks configured while every deployment
  // shares a key anyone can read from the repo.
  // A random per-boot secret means tokens do not survive a restart — annoying
  // in development, but it fails loudly instead of silently being insecure.
  logger.warn(
    'TOKEN_SECRET is unset or too short. Generating a random one for this ' +
      'process — all sessions will be invalidated on restart. Set a real ' +
      'TOKEN_SECRET (32+ chars) in back-end/.env',
  );
  return randomBytes(48).toString('hex');
}

function csv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : fallback;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 3000),
  isProduction: process.env.NODE_ENV === 'production',

  security: {
    tokenSecret: requiredSecret(),
    tokenTtlMs: num(process.env.TOKEN_TTL_MS, 8 * 60 * 60 * 1000),
    bodyLimit: process.env.BODY_LIMIT ?? '1mb',
    allowedOrigins: csv(process.env.ALLOWED_ORIGINS, [
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
    ]),
  },

  throttle: {
    limit: num(process.env.GLOBAL_THROTTLE_LIMIT, 100),
    ttlMs: num(process.env.GLOBAL_THROTTLE_TTL_MS, 60_000),
  },

  uploads: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
  },
};
