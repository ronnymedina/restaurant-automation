import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, registerUser } from './helpers';

describe('POST /v1/auth/recover (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 — usuario inactivo: regenera token y responde mensaje genérico', async () => {
    const email = uniqueEmail('recover-inactive');
    await registerUser(app, email);

    const userBefore = await prisma.user.findFirst({ where: { email } });
    const tokenBefore = userBefore!.activationToken;

    const res = await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    expect(res.body.message).toBe('Si el correo está registrado, recibirás un email en breve.');

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).not.toBeNull();
    expect(userAfter!.activationToken).not.toBe(tokenBefore);
  });

  it('200 — usuario activo: regenera token (para reset password) y responde mensaje genérico', async () => {
    const email = uniqueEmail('recover-active');
    await registerUser(app, email);

    // Activar directamente en DB
    await prisma.user.updateMany({
      where: { email },
      data: { isActive: true, activationToken: null },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    expect(res.body.message).toBe('Si el correo está registrado, recibirás un email en breve.');

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).not.toBeNull();
  });

  it('200 — email no registrado: responde exactamente igual (no revela nada)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email: uniqueEmail('ghost') })
      .expect(200);

    expect(res.body.message).toBe('Si el correo está registrado, recibirás un email en breve.');
  });

  it('400 — email inválido devuelve error de validación', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('429 — el 4° request con el mismo email retorna Too Many Requests', async () => {
    const email = uniqueEmail('recover-ratelimit');
    await registerUser(app, email);

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/v1/auth/recover')
        .send({ email })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(429);
  });
});
