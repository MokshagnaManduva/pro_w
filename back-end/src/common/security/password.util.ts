import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * V4 (v4-security) — password hashing.
 *
 * WHY scrypt: it is deliberately slow AND memory-hard, so brute-forcing a
 * leaked store is expensive in both CPU and RAM. It ships in Node's crypto
 * module, so this needs no dependency at all — one fewer thing to audit than
 * bcrypt or argon2.
 *
 * Format: scrypt$N$salt$derivedKey, all hex. The parameters are stored WITH
 * the hash so they can be raised later without invalidating existing hashes.
 */

const KEYLEN = 64;
const SALT_BYTES = 16;
const COST = 16384; // 2^14 — the Node default; raise for production hardware.

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = scryptSync(plain, salt, KEYLEN, { N: COST }).toString('hex');
  return `scrypt$${COST}$${salt}$${derived}`;
}

/**
 * Constant-time verification.
 *
 * A plain === comparison returns as soon as two bytes differ, so response time
 * leaks how much of the value was correct. timingSafeEqual always compares the
 * full buffer.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    // Not a hash we produced — treat as a failed login rather than falling
    // back to a plaintext comparison, which would defeat the whole exercise.
    return false;
  }

  const [, costRaw, salt, expectedHex] = parts;
  const cost = Number(costRaw);
  if (!Number.isFinite(cost) || cost <= 0) return false;

  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(plain, salt, expected.length, { N: cost });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** True if a value is already hashed — used when migrating the seed data. */
export function isHashed(value: string): boolean {
  return typeof value === 'string' && value.startsWith('scrypt$');
}
