// test/kiosk/kioskMenuItems.e2e-spec.ts
// PUBLIC endpoint — no JWT required
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, seedProduct, seedMenu } from './kiosk.helpers';

const TEST_DB = path.resolve(__dirname, 'test-kiosk-menu-items.db');

describe('GET /v1/kiosk/:slug/menus/:menuId/items - kioskMenuItems (e2e) [PUBLIC]', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let slug: string;
  let menuId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    slug = restA.restaurant.slug;
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const menu = await seedMenu(prisma, restA.restaurant.id, product.id);
    menuId = menu.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Slug inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get(`/v1/kiosk/slug-inexistente/menus/${menuId}/items`)
      .expect(404);
  });

  it('menuId inexistente → 404', async () => {
    // PUBLIC — no token needed
    await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus/menu-inexistente/items`)
      .expect(404);
  });

  it('Retorna menuId, menuName y sections', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus/${menuId}/items`)
      .expect(200);

    expect(res.body.menuId).toBe(menuId);
    expect(res.body.menuName).toBeDefined();
    expect(res.body.sections).toBeDefined();
    expect(typeof res.body.sections).toBe('object');
  });

  it('Items agrupados por sección con campos requeridos', async () => {
    // PUBLIC — no token needed
    const res = await request(app.getHttpServer())
      .get(`/v1/kiosk/${slug}/menus/${menuId}/items`)
      .expect(200);

    const sectionKeys = Object.keys(res.body.sections);
    expect(sectionKeys.length).toBeGreaterThan(0);

    const firstSection = res.body.sections[sectionKeys[0]];
    expect(Array.isArray(firstSection)).toBe(true);
    const item = firstSection[0];
    expect(item.id).toBeDefined();
    expect(item.menuItemId).toBeDefined();
    expect(item.name).toBeDefined();
    expect(typeof item.price).toBe('number');
    expect(item.stockStatus).toBeDefined();
  });
});
