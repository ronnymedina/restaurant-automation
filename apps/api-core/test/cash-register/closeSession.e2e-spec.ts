// test/cash-register/closeSession.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-close-session.db');

describe('POST /v1/cash-register/close - closeSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let restaurantId: string;
  let categoryId: string;
  let adminId: string;
  let basicToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    restaurantId = restA.restaurant.id;
    categoryId = restA.category.id;
    adminId = restA.admin.id;
    basicToken = await login(app, restA.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).post('/v1/cash-register/close').expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('Sin sesión abierta → 409 NO_OPEN_REGISTER', async () => {
    // Use a fresh restaurant with no open session
    const restFresh = await seedRestaurant(prisma, 'NoSession');
    const freshToken = await login(app, restFresh.admin.email);

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${freshToken}`)
      .expect(409);

    expect(res.body.code).toBe('NO_OPEN_REGISTER');
  });

  it('Cierra sesión → 200 con session y summary', async () => {
    const restC = await seedRestaurant(prisma, 'C');
    const tokenC = await login(app, restC.admin.email);
    const product = await seedProduct(prisma, restC.restaurant.id, restC.category.id);
    const shiftId = await openCashShiftViaApi(app, tokenC);
    await seedOrderOnShift(prisma, restC.restaurant.id, shiftId, product.id);

    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);

    expect(res.body.session).toBeDefined();
    expect(res.body.session.status).toBe('CLOSED');
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.totalOrders).toBe('number');
    expect(typeof res.body.summary.totalSales).toBe('number');
    expect(res.body.summary.totalOrders).toBe(1);
  });
});
