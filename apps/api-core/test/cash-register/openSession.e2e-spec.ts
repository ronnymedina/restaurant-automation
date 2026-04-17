// test/cash-register/openSession.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './cash-register.helpers';

const TEST_DB = path.resolve(__dirname, 'test-open-session.db');

describe('POST /v1/cash-register/open - openSession (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).post('/v1/cash-register/open').expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('ADMIN abre sesión → 201 con CashShiftDto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('OPEN');
    expect(res.body.restaurantId).toBeDefined();
    expect(res.body.openedAt).toBeDefined();
  });

  it('Sesión ya abierta → 409 REGISTER_ALREADY_OPEN', async () => {
    // adminToken already has an open session from the previous test
    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(res.body.code).toBe('REGISTER_ALREADY_OPEN');
  });

  it('MANAGER puede abrir su propia sesión → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cash-register/open')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);

    expect(res.body.status).toBe('OPEN');
  });
});
