import { HttpStatus } from '@nestjs/common';

/**
 * V2 (v2-error-handling) — stable machine-readable error codes.
 *
 * WHY: the message string is for humans and will be reworded over time. A code
 * is a contract the front-end can branch on, and a token you can grep the log
 * files for. Without one, the only way to find "all the auth failures" is a
 * substring search over prose.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  UPLOAD_REJECTED: 'UPLOAD_REJECTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Default code for a status, when the thrower did not supply one. */
export function codeForStatus(status: number): ErrorCodeValue {
  switch (status) {
    case HttpStatus.BAD_REQUEST: return ErrorCode.BAD_REQUEST;
    case HttpStatus.UNAUTHORIZED: return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN: return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND: return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT: return ErrorCode.CONFLICT;
    case HttpStatus.PAYLOAD_TOO_LARGE: return ErrorCode.PAYLOAD_TOO_LARGE;
    case HttpStatus.UNSUPPORTED_MEDIA_TYPE: return ErrorCode.UNSUPPORTED_MEDIA_TYPE;
    case HttpStatus.TOO_MANY_REQUESTS: return ErrorCode.TOO_MANY_REQUESTS;
    case HttpStatus.REQUEST_TIMEOUT: return ErrorCode.REQUEST_TIMEOUT;
    default: return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
  }
}

/**
 * Message shown to the client for a 5xx.
 *
 * Internal messages leak file paths, library versions and query structure, so
 * the client gets this plus a requestId; the detail goes to the error log.
 */
export const GENERIC_5XX_MESSAGE =
  'Something went wrong on our end. Quote the request ID if you report this.';
