/**
 * E2E: POST /v1/menus/:menuId/items/bulk
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 403 BASIC cannot bulk create
 *  - 404 menu not found
 *  - 404 isolation — restaurant B cannot bulk add to menu from restaurant A
 *  - 400 empty sectionName
 *  - 400 productIds exceeds max 50
 *  - 201 creates all items and returns count
 *  - 201 orders items sequentially within section
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';
import { ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menu-items-bulk.db');

describe('POST /v1/menus/:menuId/items/bulk (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminCookieA: string;
  let basicCookieA: string;
  let adminCookieB: string;
  let menuId: string;
  let productId: string;
  let productId2: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'bulkA');
    adminCookieA = await login(app, seedA.admin.email);
    basicCookieA = await login(app, seedA.basic.email);
    productId   = seedA.product.id;

    // Create a second product
    productId2 = (await prisma.product.create({
      data: {
        name: 'Bife de chorizo',
        price: 2000n,
        restaurantId: seedA.restaurant.id,
        categoryId: seedA.defaultCategory.id,
      },
    })).id;

    const seedB = await seedRestaurant(prisma, 'bulkB');
    adminCookieB = await login(app, seedB.admin.email);

    const menuRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Menu Bulk' })
      .expect(201);

    menuId = menuRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items/bulk`)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: [productId], sectionName: 'Carnes' })
      .expect(401);
  });

  it('403 — BASIC cannot bulk create items', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items/bulk`)
      .set('Cookie', basicCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: [productId], sectionName: 'Carnes' })
      .expect(403);
  });

  it('404 — menu not found', async () => {
    await request(app.getHttpServer())
      .post('/v1/menus/00000000-0000-0000-0000-000000000000/items/bulk')
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: [productId], sectionName: 'Carnes' })
      .expect(404);
  });

  it('404 — restaurant B cannot bulk add to menu from restaurant A (isolation)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items/bulk`)
      .set('Cookie', adminCookieB)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: [productId], sectionName: 'Carnes' })
      .expect(404);
  });

  it('400 — empty sectionName is rejected', async () => {
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items/bulk`)
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: [productId], sectionName: '' })
      .expect(400);
  });

  it('400 — more than 50 productIds is rejected', async () => {
    const ids = Array.from({ length: 51 }, () => productId);
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items/bulk`)
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: ids, sectionName: 'Carnes' })
      .expect(400);
  });

  it('201 — creates all items and returns count', async () => {
    const menuRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Menu Bulk Count' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/v1/menus/${menuRes.body.id}/items/bulk`)
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: [productId, productId2], sectionName: 'Platos Principales' })
      .expect(201);

    expect(res.body.created).toBe(2);
    expect(typeof res.body.created).toBe('number');
  });

  it('201 — items are added in order within section', async () => {
    const menuRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Menu Bulk Order' })
      .expect(201);

    const bulkMenuId = menuRes.body.id;

    await request(app.getHttpServer())
      .post(`/v1/menus/${bulkMenuId}/items/bulk`)
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ productIds: [productId, productId2], sectionName: 'Carnes' })
      .expect(201);

    const getRes = await request(app.getHttpServer())
      .get(`/v1/menus/${bulkMenuId}`)
      .set('Cookie', adminCookieA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    const items = getRes.body.items;
    expect(items).toHaveLength(2);
    expect(items[0].order).toBeLessThan(items[1].order);
  });
});
