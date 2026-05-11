// test/cash-register/sessionHistory.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, openCashShiftViaApi } from './cash-register.helpers';

describe('GET /v1/cash-register/history - sessionHistory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminTokenB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    // Open and close two sessions for restA to have history
    await openCashShiftViaApi(app, adminToken);
    await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await openCashShiftViaApi(app, adminToken);
    await request(app.getHttpServer())
      .post('/v1/cash-register/close')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/cash-register/history').expect(401);
  });

  it('Retorna estructura paginada { data, meta }', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.totalPages).toBe('number');
  });

  it('Paginación: page=1&limit=1 retorna 1 resultado', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(1);
  });

  it('Aislamiento por restaurante (restB no ve sesiones de restA)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/history')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    expect(res.body.meta.total).toBe(0);
  });
});
