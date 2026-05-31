import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';

import {
  bootstrapApp,
  registerUser,
  activateUser,
  uniqueEmail,
} from './helpers';
import { loginCookie, ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth cookie flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = uniqueEmail('cookie');

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    prisma = boot.prisma;
    await registerUser(app, email);
    await activateUser(app, prisma, email);
  });

  afterAll(async () => {
    await app.close();
  });

  it('login → /v1/auth/me with cookie returns 200; with Bearer returns 401', async () => {
    const { accessCookie } = await loginCookie(app, email, 'Password123');
    // Pull raw JWT out of the cookie value for the negative test
    const jwt = accessCookie.split('=')[1]!;

    const withCookie = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN);
    expect(withCookie.status).toBe(200);

    const withBearer = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${jwt}`)
      .set('Origin', ALLOWED_TEST_ORIGIN);
    expect(withBearer.status).toBe(401);
  });
});
