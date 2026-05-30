import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';

const ALLOWED_ORIGIN = 'http://localhost:4321';

/**
 * Logs in and returns the raw access_token + refresh_token cookies as
 * `Cookie:`-header-ready strings. The Origin header is set to the dev
 * allowlist value so CsrfOriginGuard (global) does not reject the request.
 */
export async function loginCookie(
  app: INestApplication<App>,
  email: string,
  password = 'Admin1234!',
): Promise<{ accessCookie: string; refreshCookie: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .set('Origin', ALLOWED_ORIGIN)
    .send({ email, password });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  if (!Array.isArray(setCookie)) {
    throw new Error('Login did not return Set-Cookie headers');
  }
  const accessCookie = setCookie.find((c) => c.startsWith('access_token='));
  const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='));
  if (!accessCookie || !refreshCookie) {
    throw new Error(`Missing auth cookies in Set-Cookie: ${setCookie.join(' | ')}`);
  }

  return {
    accessCookie: accessCookie.split(';')[0]!,
    refreshCookie: refreshCookie.split(';')[0]!,
  };
}

export const ALLOWED_TEST_ORIGIN = ALLOWED_ORIGIN;
