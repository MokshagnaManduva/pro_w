import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  FILE_LOGGER,
  type IFileLogger,
  type IAuthedRequest,
} from '../contracts';
import {
  ErrorCode,
  GENERIC_5XX_MESSAGE,
  codeForStatus,
  type ErrorCodeValue,
} from '../errors/error-codes';
import { mapMulterError } from '../errors/multer-error.util';

const EXPOSE_STACK = process.env.EXPOSE_STACK_TRACES === 'true';

/**
 * V2 (v2-error-handling) — the single global exception filter.
 *
 * Catches EVERYTHING (@Catch() with no argument), so a raw TypeError produces
 * the same clean envelope as a deliberate BadRequestException rather than
 * leaking a stack trace to the client.
 *
 * Registered via APP_FILTER in ErrorHandlingModule, never with
 * app.useGlobalFilters — an instance registration there would shadow this and
 * break the DI that persists errors to file. See error-handling.module.ts.
 *
 * The response envelope { success, message, data } is a CONTRACT: store.js
 * reads json.data on every call. Fields are added, never removed or renamed.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(@Inject(FILE_LOGGER) private readonly fileLogger: IFileLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<IAuthedRequest>();

    const { status, message, code, data, stack } = this.classify(exception);

    // ── Persist before responding ─────────────────────────────────────────
    // Redaction of password/token/authorization happens inside the logger, so
    // every caller inherits it — a failed login must never write a plaintext
    // credential into a file.
    this.fileLogger.write('error', {
      ts: new Date().toISOString(),
      requestId: request?.requestId,
      level: status >= 500 ? 'error' : 'warn',
      method: request?.method,
      path: request?.originalUrl,
      status,
      message,
      stack,
      role: request?.user?.role ?? request?.get?.('role') ?? '-',
      userId: request?.user?.userId ?? request?.get?.('user-id') ?? '-',
      body: request?.body as Record<string, unknown> | undefined,
      event: 'request.failed',
      action: code,
    });

    // Server faults are also surfaced in the terminal — a 500 should be
    // impossible to miss while developing.
    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.originalUrl} → ${status} [${request?.requestId}] ${message}`,
        stack,
      );
    }

    // ── Respond ───────────────────────────────────────────────────────────
    // 5xx returns a generic message; the real one is in the log, findable by
    // requestId. 4xx messages are safe and actionable, so they pass through.
    const clientMessage = status >= 500 ? GENERIC_5XX_MESSAGE : message;

    response.status(status).json({
      success: false,
      message: clientMessage,
      data,
      code,
      requestId: request?.requestId,
      path: request?.originalUrl,
      timestamp: new Date().toISOString(),
      ...(EXPOSE_STACK && stack ? { stack } : {}),
    });
  }

  /** Normalise any thrown value into the fields we need. */
  private classify(exception: unknown): {
    status: number;
    message: string;
    code: ErrorCodeValue;
    data: unknown;
    stack?: string;
  } {
    // multer rejects during the upload stream and does not throw HttpException.
    const multer = mapMulterError(exception);
    if (multer) {
      return {
        status: multer.status,
        message: multer.message,
        code: multer.code,
        data: null,
        stack: (exception as Error)?.stack,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        return { status, message: res, code: codeForStatus(status), data: null };
      }

      const body = res as Record<string, unknown>;

      // Guards and services may already throw our envelope shape; honour it
      // but still stamp a code so every error has one.
      if (body.success !== undefined) {
        return {
          status,
          message: String(body.message ?? 'Request failed'),
          code: (body.code as ErrorCodeValue) ?? codeForStatus(status),
          data: body.data ?? null,
        };
      }

      // class-validator surfaces failures as message: string[].
      const isValidation = Array.isArray(body.message);
      return {
        status,
        message: isValidation
          ? (body.message as string[]).join(', ')
          : String(body.message ?? 'Request failed'),
        code: isValidation ? ErrorCode.VALIDATION_FAILED : codeForStatus(status),
        data: isValidation ? { fields: body.message } : (body.error ?? null),
      };
    }

    if (exception instanceof Error) {
      // Some library errors are HTTP-aware without being HttpException.
      // body-parser's PayloadTooLargeError carries status 413; without this it
      // would be reported as a generic 500 and the client would be told the
      // server broke rather than that their upload was too big.
      const httpish = exception as Error & { status?: number; statusCode?: number };
      const carried = httpish.status ?? httpish.statusCode;
      if (typeof carried === 'number' && carried >= 400 && carried < 600) {
        return {
          status: carried,
          message: exception.message,
          code: codeForStatus(carried),
          data: null,
          stack: exception.stack,
        };
      }

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
        code: ErrorCode.INTERNAL_ERROR,
        data: null,
        stack: exception.stack,
      };
    }

    // Someone threw a non-Error (a string, an object). Still must not 200.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: `Non-Error thrown: ${safeStringify(exception)}`,
      code: ErrorCode.INTERNAL_ERROR,
      data: null,
    };
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
