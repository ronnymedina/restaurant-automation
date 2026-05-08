import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, registerUser, activateUser } from './helpers';

describe('PUT /v1/auth/reset-password (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 — reset exitoso: devuelve email y borra el activationToken', async () => {
    const email = uniqueEmail('reset-ok');
    await registerUser(app, email);
    await activateUser(app, prisma, email);

    // Generar token de reset via recover
    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    const userWithToken = await prisma.user.findFirst({ where: { email } });
    const resetToken = userWithToken!.activationToken!;

    const res = await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: resetToken, password: 'NewPassword456' })
      .expect(200);

    expect(res.body).toEqual({ email });

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).toBeNull();
    expect(userAfter!.isActive).toBe(true);
  });

  it('200 — puede iniciar sesión con la nueva contraseña tras el reset', async () => {
    const email = uniqueEmail('reset-login');
    await registerUser(app, email);
    await activateUser(app, prisma, email);

    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    const userWithToken = await prisma.user.findFirst({ where: { email } });
    const resetToken = userWithToken!.activationToken!;

    await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: resetToken, password: 'ResetedPass789' })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'ResetedPass789' })
      .expect(201);

    expect(loginRes.body.accessToken).toBeDefined();
  });

  it('400 INVALID_ACTIVATION_TOKEN — token desconocido', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: 'nonexistent-token', password: 'Password123' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_ACTIVATION_TOKEN');
  });

  it('400 ACCOUNT_INACTIVE — token de activación de usuario inactivo no sirve para reset', async () => {
    const email = uniqueEmail('reset-inactive');
    await registerUser(app, email);

    const user = await prisma.user.findFirst({ where: { email } });
    const activationToken = user!.activationToken!;

    const res = await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: activationToken, password: 'Password123' })
      .expect(400);

    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('400 — contraseña menor a 8 caracteres devuelve error de validación', async () => {
    await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: 'any-token', password: 'short' })
      .expect(400);
  });
});
