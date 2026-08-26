import { createHmac, timingSafeEqual } from 'crypto';
import type { ITokenPayload } from '../contracts';
import { config } from '../../config/configuration';

/**
 * V4 (v4-security) — signed session tokens. Replaces the V0 encode-only stub.
 *
 * WHY NOT a JWT library: a JWT is base64url(header).base64url(payload).HMAC.
 * We need exactly the tamper-evidence, and Node's crypto gives us the HMAC
 * directly — so this is the same guarantee with one fewer dependency.
 *
 * HONEST TRADE-OFF, worth saying out loud if asked: we give up the standard
 * claim set (iss/aud/jti), key rotation via `kid`, and the ecosystem of
 * libraries that validate all of it. For a single-service app with no third
 * party consuming these tokens, that is a fair trade. It would not be for an
 * API other people integrate with.
 *
 * This is a SESSION token, not a password substitute — it is bearer-only, so
 * anyone holding it is the user. That is why it expires.
 */

const SEPARATOR = '.';

function sign(data: string): string {
  return createHmac('sha256', config.security.tokenSecret).update(data).digest('base64url');
}

export function signToken(payload: Omit<ITokenPayload, 'iat' | 'exp'>): string {
  const now = Date.now();
  const full: ITokenPayload = {
    ...payload,
    iat: now,
    exp: now + config.security.tokenTtlMs,
  };

  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${body}${SEPARATOR}${sign(body)}`;
}

/**
 * Returns the payload only if the signature is valid AND it has not expired.
 * Returns null on any problem — callers must treat null as "not authenticated"
 * and never fall back to trusting the unverified body.
 */
export function verifyToken(token: string | undefined | null): ITokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const idx = token.lastIndexOf(SEPARATOR);
  if (idx <= 0) return null;

  const body = token.slice(0, idx);
  const providedSig = token.slice(idx + 1);
  const expectedSig = sign(body);

  // Constant-time compare so response timing does not leak how much of a
  // forged signature was correct.
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ITokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (!payload.userId || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Pull a bearer token out of an Authorization header. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
