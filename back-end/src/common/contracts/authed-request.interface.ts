import type { Request } from 'express';
import type { ITokenPayload } from './token-payload.interface';

/**
 * Express Request enriched by our middleware — FROZEN CONTRACT (V0).
 *
 * requestId is set by V1's RequestIdMiddleware.
 * user is set by V5's AuthMiddleware, after it verifies V4's token.
 */
export interface IAuthedRequest extends Request {
  requestId?: string;
  user?: ITokenPayload;
}
