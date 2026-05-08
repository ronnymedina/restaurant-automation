import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, uniqueName } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-resend.db');

describe('POST /v1/onboarding/resend-activation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  async function registerUser(email: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', email)
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .expect(201);
  }

  it('200 — reenvía email a usuario inactivo y regenera el token', async () => {
    const email = uniqueEmail('resend-ok');
    await registerUser(email);

    const userBefore = await prisma.user.findFirst({ where: { email } });
    expect(userBefore!.isActive).toBe(false);
    const tokenBefore = userBefore!.activationToken;

    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email })
      .expect(200);

    expect(res.body).toEqual({ message: 'Activation email sent' });

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).not.toBeNull();
    expect(userAfter!.activationToken).not.toBe(tokenBefore);
  });

  it('404 — email no registrado devuelve USER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email: uniqueEmail('ghost') })
      .expect(404);

    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('409 — cuenta ya activa devuelve USER_ALREADY_ACTIVE', async () => {
    const email = uniqueEmail('active');
    await registerUser(email);

    // Activate the user directly in DB
    await prisma.user.updateMany({
      where: { email },
      data: { isActive: true, activationToken: null },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email })
      .expect(409);

    expect(res.body.code).toBe('USER_ALREADY_ACTIVE');
  });

  it('429 — el 4° request con el mismo email retorna Too Many Requests', async () => {
    const email = uniqueEmail('ratelimit');
    await registerUser(email);

    // 3 allowed requests
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/v1/onboarding/resend-activation')
        .send({ email })
        .expect(200);
    }

    // 4th request must be blocked
    await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email })
      .expect(429);
  });
});
