import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { TimeoutInterceptor } from '../interceptors/timeout.interceptor';

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
 * PRECEDENCE, verified empirically on 2026-08-26 — do not guess at this:
 *   1. app.useGlobalFilters(instance) BEATS APP_FILTER providers entirely.
 *      That is why main.ts registers no filters at all.
 *   2. Among APP_FILTER providers, the LAST registered wins — it is checked
 *      first. Specificity does NOT decide it: a @Catch() catch-all listed
 *      after a @Catch(NotFoundException) will swallow the NotFoundException.
 *      So register the catch-all FIRST and narrower filters AFTER it.
 */
@Module({
  providers: [
    // Catch-all first, so narrower filters added later take precedence.
    // V2 deliberately ships ONE filter: multer errors are mapped inside it via
    // multer-error.util.ts rather than by a second competing filter.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },

    // Interceptors do not compete the way filters do — they all run, chained.
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
  ],
})
export class ErrorHandlingModule {}
