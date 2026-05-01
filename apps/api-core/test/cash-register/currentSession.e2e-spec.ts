// test/cash-register/currentSession.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, openCashShiftViaApi } from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-current-session.db');

describe('GET /v1/cash-register/current - currentSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
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

    expect(res.body.userId).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(restC.admin.email);
  });
});
