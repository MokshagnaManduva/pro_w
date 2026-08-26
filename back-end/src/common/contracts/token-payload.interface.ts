/**
 * Session token payload — FROZEN CONTRACT (V0).
 *
 * V4 (security) signs it; V5 (router middleware) verifies it and attaches the
 * result to the request as req.user.
 */
export interface ITokenPayload {
  userId: string;
  role: 'client' | 'worker' | 'expert' | 'superuser';
  name: string;
  email: string;
  /** Issued-at, epoch milliseconds. */
  iat: number;
  /** Expires-at, epoch milliseconds. */
  exp: number;
}
