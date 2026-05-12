// test/cash-register/currentSession.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, openCashShiftViaApi } from './cash-register.helpers';

describe('GET /v1/cash-register/current - currentSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/cash-register/current').expect(401);
  });

  it('Sin sesión abierta → 200 objeto vacío {}', async () => {
    const restA = await seedRestaurant(prisma, 'A');
    const token = await login(app, restA.admin.email);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Object.keys(res.body)).toHaveLength(0);
  });

  it('Con sesión abierta → 200 con CashShiftDto', async () => {
    const restB = await seedRestaurant(prisma, 'B');
    const token = await login(app, restB.admin.email);
    await openCashShiftViaApi(app, token);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('OPEN');
  });

  it('Con sesión abierta → respuesta incluye user.email del abridor', async () => {
    const restC = await seedRestaurant(prisma, 'C');
    const token = await login(app, restC.admin.email);
    await openCashShiftViaApi(app, token);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.userId).toBeUndefined();
    expect(res.body.user).toBeUndefined();
    expect(res.body.openedByEmail).toBe(restC.admin.email);
  });
});
