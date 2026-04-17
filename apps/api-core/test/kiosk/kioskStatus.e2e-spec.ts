// test/kiosk/kioskStatus.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, openCashShift } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-status.db');

describe('GET /v1/kiosk/:slug/status - kioskStatus (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let slugWithShift: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    // Restaurant without open shift
    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;

    // Restaurant with open shift
    const restB = await seedRestaurant(prisma, 'B');
    slugWithShift = restB.restaurant.slug;
    await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get('/v1/kiosk/slug-que-no-existe/status')
      .expect(404);
  });

  it('Sin caja abierta → 200, registerOpen: false', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/status`)
      .expect(200);

    expect(res.body.registerOpen).toBe(false);
  });

  it('Con caja abierta → 200, registerOpen: true', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slugWithShift}/status`)
      .expect(200);

    expect(res.body.registerOpen).toBe(true);
  });
});
