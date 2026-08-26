import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import type { IAuthedRequest } from '../contracts';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_DELIVERABLE_BYTES ?? 50 * 1024 * 1024);

/**
 * V5 (v5-router-middleware) — ROUTER-LEVEL pre-flight for uploads.
 *
 * Bound only to api/uploads/*. It runs BEFORE multer, which is the entire
 * point: rejecting a 500 MB body here costs nothing, whereas letting multer
 * start means streaming the whole thing to disk before discovering the limit.
 *
 * Bound by PATH STRING rather than by importing UploadsController, so this
 * branch never references V3's code and the two can be built and merged
 * independently.
 *
 * This does NOT replace multer's own limits — Content-Length is client-supplied
 * and can lie. It is a cheap first filter; multer's fileSize limit remains the
 * authoritative check on actual bytes received.
 */
@Injectable()
export class UploadGuardMiddleware implements NestMiddleware {
  use(req: IAuthedRequest, _res: Response, next: NextFunction): void {
    // Reads are fine; only guard the methods that carry a body.
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') {
      return next();
    }

    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      throw new HttpException(
        {
          success: false,
          message: 'Uploads must be sent as multipart/form-data.',
          data: null,
          code: 'UNSUPPORTED_MEDIA_TYPE',
        },
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const declared = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
      throw new HttpException(
        {
          success: false,
          message: `Upload exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit.`,
          data: null,
          code: 'PAYLOAD_TOO_LARGE',
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    next();
  }
}
