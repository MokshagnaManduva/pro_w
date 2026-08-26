import { Logger, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { join, resolve, normalize } from 'path';
import { mkdirSync } from 'fs';
import { config } from '../../config/configuration';

/**
 * V4 (v4-security) — application-level security middleware.
 *
 * These are registered with app.use() rather than consumer.apply() because
 * they are dependency-free third-party middleware and must wrap EVERYTHING,
 * including routes Nest does not own (Swagger, static assets).
 */
export function setupSecurity(app: INestApplication): void {
  const logger = new Logger('Security');
  const expressApp = app as NestExpressApplication;

  // ── Security headers ──────────────────────────────────────────────────────
  // helmet is not magic: it sets about a dozen response headers —
  // X-Content-Type-Options: nosniff, X-Frame-Options (clickjacking),
  // Strict-Transport-Security, Referrer-Policy, and a CSP.
  expressApp.use(
    helmet({
      // Swagger UI at /api-docs uses inline scripts and styles, which a strict
      // default CSP blocks outright. Rather than disable CSP globally, allow
      // exactly what Swagger needs. Uploaded files are served from this origin
      // only.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // The API serves uploaded files to a front-end on a different port, so
      // the default same-origin resource policy would block them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HSTS only makes sense over HTTPS; enabling it on plain-HTTP localhost
      // can pin a browser to https://localhost and be genuinely annoying.
      hsts: config.isProduction,
    }),
  );

  expressApp.use(compression());

  // ── Request size limit ────────────────────────────────────────────────────
  // Without a cap, one client can exhaust memory with a single huge JSON body.
  // Multipart uploads are limited separately by multer (V3), not by this.
  expressApp.useBodyParser('json', { limit: config.security.bodyLimit });
  expressApp.useBodyParser('urlencoded', { limit: config.security.bodyLimit, extended: true });

  // ── CORS allow-list ───────────────────────────────────────────────────────
  // Replaces origin:'*', which let ANY website call this API from a logged-in
  // user's browser. Called after main.ts's permissive enableCors, so this wins.
  expressApp.enableCors({
    origin: (origin, callback) => {
      // No Origin header: same-origin, curl, or a file:// page. Not a
      // cross-site request, so there is nothing for CORS to protect against.
      if (!origin) return callback(null, true);

      if (config.security.allowedOrigins.includes(origin)) return callback(null, true);

      logger.warn(`Blocked cross-origin request from ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Request-Id, role, user-id',
    exposedHeaders: 'X-Request-Id',
  });

  // ── Uploaded files, served behind a traversal guard ───────────────────────
  // Serving user-supplied files is a security concern, which is why it lives
  // here and not in V3's upload layer.
  const uploadRoot = resolve(process.cwd(), config.uploads.dir);
  mkdirSync(uploadRoot, { recursive: true });

  expressApp.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    // Defence in depth. express.static already resolves safely, but an
    // explicit check documents the intent and catches a future refactor that
    // swaps in a hand-rolled file handler.
    const target = resolve(join(uploadRoot, normalize(decodeURIComponent(req.path))));
    if (target !== uploadRoot && !target.startsWith(uploadRoot + '/')) {
      logger.warn(`Blocked path traversal attempt: ${req.path}`);
      res.status(400).json({
        success: false,
        message: 'Invalid file path.',
        data: null,
        code: 'BAD_REQUEST',
      });
      return;
    }
    next();
  });

  expressApp.useStaticAssets(uploadRoot, {
    prefix: '/uploads/',
    // Never let an uploaded .html run as a document on our origin, and never
    // let the browser guess a type we did not intend.
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'attachment');
    },
  });

  logger.log(
    `helmet + compression on · body limit ${config.security.bodyLimit} · ` +
      `CORS allow-list: ${config.security.allowedOrigins.join(', ')}`,
  );
}
