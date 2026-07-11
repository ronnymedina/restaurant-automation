// test/kiosk/kioskMenus.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, seedProduct, seedMenu } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-menus.db');

describe('GET /v1/kiosk/:slug/menus - kioskMenus (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let slugNoMenus: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    await seedMenu(prisma, restA.restaurant.id, product.id);

    const restB = await seedRestaurant(prisma, 'B');
    slugNoMenus = restB.restaurant.slug;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get('/v1/kiosk/slug-inexistente/menus')
      .expect(404);
  });

  it('Sin menús activos → 200 array vacío', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slugNoMenus}/menus`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('Con menú activo → 200 array con menús', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].id).toBeDefined();
    expect(res.body[0].name).toBeDefined();
  });
});
