import { HttpStatus } from '@nestjs/common';
import { ErrorCode, type ErrorCodeValue } from './error-codes';

/**
 * V2 (v2-error-handling) — translate multer's error codes into our envelope.
 *
 * DESIGN NOTE: this is a pure function called by HttpExceptionFilter, not a
 * separate @Catch(MulterError) filter. Two reasons:
 *   1. Filter precedence is registration-order based (see
 *      error-handling.module.ts), so a second global filter is one more thing
 *      to get subtly wrong.
 *   2. It keeps a single place that owns the error envelope shape.
 * It stays in its own file so V3 can find and extend it without touching the
 * filter.
 */
export interface MappedError {
  status: number;
  code: ErrorCodeValue;
  message: string;
}

/** multer sets err.code to one of these on an upload rejection. */
const MULTER_CODES: Record<string, { status: number; code: ErrorCodeValue; message: string }> = {
  LIMIT_FILE_SIZE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    code: ErrorCode.PAYLOAD_TOO_LARGE,
    message: 'That file is larger than the allowed limit.',
  },
  LIMIT_FILE_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.UPLOAD_REJECTED,
    message: 'Too many files in a single upload.',
  },
  LIMIT_UNEXPECTED_FILE: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.UPLOAD_REJECTED,
    message: 'Unexpected file field in the upload.',
  },
  LIMIT_PART_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.UPLOAD_REJECTED,
    message: 'Too many parts in the multipart request.',
  },
  LIMIT_FIELD_KEY: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.UPLOAD_REJECTED,
    message: 'A form field name was too long.',
  },
  LIMIT_FIELD_VALUE: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.UPLOAD_REJECTED,
    message: 'A form field value was too long.',
  },
};

/** Returns null when the exception is not a multer error. */
export function mapMulterError(exception: unknown): MappedError | null {
  if (!exception || typeof exception !== 'object') return null;

  const err = exception as { name?: string; code?: string; field?: string };
  // Identify by name rather than instanceof, so this file never has to import
  // multer — which keeps V2 independent of whether V3 has merged yet.
  if (err.name !== 'MulterError' || typeof err.code !== 'string') return null;

  const mapped = MULTER_CODES[err.code];
  if (!mapped) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.UPLOAD_REJECTED,
      message: 'The upload was rejected.',
    };
  }
  return {
    ...mapped,
    message: err.field ? `${mapped.message} (field: ${err.field})` : mapped.message,
  };
}
