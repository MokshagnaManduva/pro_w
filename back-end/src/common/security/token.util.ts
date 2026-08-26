import type { ITokenPayload } from '../contracts';

/**
 * V0 STUB — NOT SECURE. V4 (v4-security) REPLACES THIS BODY.
 *
 * Exists so V5 can build AuthMiddleware against a real signature on day one,
 * without waiting for V4 to merge. Encoding only — no signature, no secret.
 *
 * V4 replaces this with HMAC-SHA256 over the payload using a secret from .env,
 * plus timingSafeEqual comparison and expiry enforcement. Keep the signatures.
 */

const TOKEN_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

export function signToken(payload: Omit<ITokenPayload, 'iat' | 'exp'>): string {
  const now = Date.now();
  const full: ITokenPayload = { ...payload, iat: now, exp: now + TOKEN_TTL_MS };
  // V0: base64 only. V4 appends an HMAC signature here.
  return Buffer.from(JSON.stringify(full)).toString('base64url');
}

export function verifyToken(token: string): ITokenPayload | null {
  try {
    // V0: no signature check — anyone can forge this. V4 fixes it.
    const payload = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as ITokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
