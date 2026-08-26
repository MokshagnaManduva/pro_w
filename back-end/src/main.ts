import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  setupSecurity,
  setupLogging,
  setupErrors,
  setupUploads,
  setupRouting,
} from './common/bootstrap';

/**
 * ⚠️  FROZEN FILE — do not edit on a layer branch.
 *
 * Each middleware layer owns one hook in src/common/bootstrap/. Add your
 * app-level setup there. Anything module-scoped belongs in your layer's module
 * (LoggingModule, ErrorHandlingModule, UploadsModule, SecurityModule,
 * RoutingModule) as an APP_FILTER / APP_INTERCEPTOR / APP_GUARD provider.
 *
 * If you genuinely need this file changed, raise it with the integrator so it
 * lands as a separate commit on main and everyone rebases.
 * See Team-Branch-Split-Plan.md section 6.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // ── Layer bootstrap hooks — order matters ────────────────────────────────
  // Security first: helmet and body limits must wrap everything downstream.
  setupSecurity(app); // V4 — helmet, compression, CORS, body limits, static
  setupLogging(app); //  V1 — process log wiring, shutdown flush
  setupErrors(app); //   V2 — unhandledRejection / uncaughtException nets
  setupUploads(app); //  V3 — ensure upload directories exist
  setupRouting(app); //  V5 — reserved; prefer RoutingModule.configure()

  // CORS — permissive default. V4 replaces this with an allow-list inside
  // setupSecurity(); calling enableCors twice is safe, the last call wins.
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, role, user-id',
  });

  // Global validation pipe (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global exception filter.
  // V2 re-registers its filters via APP_FILTER in ErrorHandlingModule, which
  // takes precedence over this instance-based registration.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Graceful shutdown so buffered logs get flushed on SIGINT/SIGTERM.
  app.enableShutdownHooks();

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Lannent API')
    .setDescription(
      'Complete REST API for the Lannent freelance platform. ' +
        'Supports Users, Tasks, Milestones, Proposals, Audit Requests, Audit Reports, ' +
        'Disputes, Transactions, Expert Applications, and Notifications. ' +
        'Uses in-memory storage with seed data.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`\n🚀 Lannent API running on http://localhost:${port}`);
  console.log(`📚 Swagger UI: http://localhost:${port}/api-docs\n`);
}
void bootstrap();
