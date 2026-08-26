/**
 * V4 (v4-security) — strip secrets from anything leaving the API.
 *
 * WHY CENTRAL: before this, GET /api/users returned every user's password in
 * plaintext, and the browser's offline login fallback read it from that cached
 * response. Sanitising in each controller would mean 48 handlers that each
 * have to remember. Doing it once at the repository boundary means no future
 * endpoint can leak the field by forgetting.
 */

const SECRET_FIELDS = ['password', 'passwordHash', 'token', 'secret'] as const;

/** Remove secret fields from a single record. Returns a copy. */
export function sanitizeUser<T extends Record<string, any>>(user: T | null | undefined): T | null {
  if (!user || typeof user !== 'object') return null;
  const copy: Record<string, any> = { ...user };
  for (const field of SECRET_FIELDS) delete copy[field];
  return copy as T;
}

export function sanitizeUsers<T extends Record<string, any>>(users: T[]): T[] {
  return (users ?? []).map((u) => sanitizeUser(u)).filter((u): u is T => u !== null);
}
