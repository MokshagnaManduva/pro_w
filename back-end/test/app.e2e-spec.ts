import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * V2 (v2-error-handling) — replaces the NestJS starter test.
 *
 * The original asserted GET / returns 'Hello World!'. There is no AppController
 * in this project and there is a global /api prefix, so it could only ever
 * fail. These tests cover the error-handling layer instead.
 */
describe('Error handling (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so the tests exercise the real pipeline.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    // The success envelope comes from this interceptor, the failure envelope
    // from APP_FILTER in ErrorHandlingModule. Both must be present or the
    // tests exercise a pipeline the real app does not have.
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the response envelope', () => {
    it('wraps success as { success, message, data }', async () => {
      const res = await request(app.getHttpServer()).get('/api/tasks').expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('wraps failure with the same envelope plus a code', async () => {
      const res = await request(app.getHttpServer()).get('/api/nope').expect(404);
      expect(res.body).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
        path: '/api/nope',
      });
      expect(typeof res.body.timestamp).toBe('string');
    });
  });

  describe('validation failures', () => {
    it('reports every invalid field, not just the first', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('role', 'client')
        .send({})
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(res.body.data.fields)).toBe(true);
      expect(res.body.data.fields.length).toBeGreaterThan(1);
    });
  });

  describe('authorisation failures', () => {
    it('rejects a role that is not permitted', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/seed/reset')
        .set('role', 'worker')
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('rejects a missing role header on a guarded route', async () => {
      const res = await request(app.getHttpServer()).post('/api/seed/reset').expect(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('secret handling', () => {
    it('never echoes a password back in an error response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users/login')
        .send({ email: 'nobody@example.com', password: 'hunter2' })
        .expect(404);

      expect(JSON.stringify(res.body)).not.toContain('hunter2');
    });

    it('does not leak a stack trace to the client by default', async () => {
      const res = await request(app.getHttpServer()).get('/api/nope').expect(404);
      expect(res.body.stack).toBeUndefined();
    });
  });
});
