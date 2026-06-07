import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  bootstrapApp, uniqueEmail, registerUser, activateUser,
} from './auth/helpers';
import { loginCookie, ALLOWED_TEST_ORIGIN } from './helpers/auth-cookie';

describe('CSRF Origin enforcement (e2e)', () => {
  let app: INestApplication<App>;
  let accessCookie: string;
  const email = uniqueEmail('csrf');

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    await registerUser(app, email);
    await activateUser(app, boot.prisma, email);
    ({ accessCookie } = await loginCookie(app, email, 'Password123'));
  });

  afterAll(async () => { await app.close(); });

  it('GET without Origin is allowed', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Cookie', accessCookie);
    expect(res.status).toBe(200);
  });

  it('POST with allowlisted Origin passes', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN);
    expect([200, 201]).toContain(res.status);
  });

  it('POST with foreign Origin is rejected with 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', accessCookie)
      .set('Origin', 'https://malicioso.com');
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('POST without Origin or Referer is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', accessCookie);
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('ORIGIN_REQUIRED');
  });
});
