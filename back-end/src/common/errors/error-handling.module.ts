import { Module } from '@nestjs/common';

/**
 * V2 (v2-error-handling) — OWNED BY THE ERROR-HANDLING LAYER.
 *
 * Register filters and interceptors HERE as APP_FILTER / APP_INTERCEPTOR
 * providers, not in main.ts or app.module.ts — both are FROZEN.
 *
 *   providers: [
 *     { provide: APP_FILTER,      useClass: HttpExceptionFilter },
 *     { provide: APP_FILTER,      useClass: NotFoundFilter },
 *     { provide: APP_FILTER,      useClass: MulterExceptionFilter },
 *     { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
 *   ]
 *
 * Multiple APP_FILTER providers are allowed; Nest applies them in order.
 */
@Module({})
export class ErrorHandlingModule {}
