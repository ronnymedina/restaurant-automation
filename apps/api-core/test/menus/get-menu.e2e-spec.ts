/**
 * E2E: GET /v1/menus/:id
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 200 ADMIN, MANAGER, BASIC can get
 *  - 404 menu not found
 *  - 404 isolation — restaurant B cannot get menu from restaurant A
 *  - 200 serializer shape with items
 *  - 200 item serializer shape (product fields)
 *  - 404 soft-deleted menu not accessible
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menus-get.db');

describe('GET /v1/menus/:id (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let menuId: string;
  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'getA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);
    productId     = seedA.product.id;

    const seedB = await seedRestaurant(prisma, 'getB');
    adminTokenB = await login(app, seedB.admin.email);

    const createRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Carta Verano', startTime: '19:00', endTime: '23:00', daysOfWeek: 'FRI,SAT,SUN' })
      .expect(201);

    menuId = createRes.body.id;

    // Add an item to the menu
    await request(app.getHttpServer())
      .post(`/v1/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ productId, sectionName: 'Carnes', order: 1 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer()).get(`/v1/menus/${menuId}`).expect(401);
  });

  it('200 — ADMIN can get menu', async () => {
    await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);
  });

  it('200 — MANAGER can get menu', async () => {
    await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(200);
  });

  it('200 — BASIC can get menu', async () => {
    await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(200);
  });

  it('404 — menu not found', async () => {
    await request(app.getHttpServer())
      .get('/v1/menus/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('404 — restaurant B cannot get menu from restaurant A (isolation)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(404);
  });

  it('200 — serializer exposes correct menu fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Carta Verano');
    expect(typeof res.body.active).toBe('boolean');
    expect(res.body.startTime).toBe('19:00');
    expect(res.body.endTime).toBe('23:00');
    expect(res.body.daysOfWeek).toBe('FRI,SAT,SUN');
    expect(Array.isArray(res.body.items)).toBe(true);

    // absent
    expect(res.body.restaurantId).toBeUndefined();
    expect(res.body.createdAt).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
    expect(res.body.itemsCount).toBeUndefined();
  });

  it('200 — item serializer exposes correct fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];

    // item fields present
    expect(item.id).toBeDefined();
    expect(item.sectionName).toBe('Carnes');
    expect(typeof item.order).toBe('number');
    expect(item.product).toBeDefined();

    // item fields absent
    expect(item.menuId).toBeUndefined();
    expect(item.productId).toBeUndefined();
    expect(item.createdAt).toBeUndefined();
    expect(item.updatedAt).toBeUndefined();

    // product fields present
    expect(item.product.id).toBeDefined();
    expect(item.product.name).toBe('Lomo al trapo');
    expect(typeof item.product.price).toBe('number');
    expect(item.product.price).toBe(15);
    expect(typeof item.product.active).toBe('boolean');

    // product fields absent
    expect(item.product.description).toBeUndefined();
    expect(item.product.stock).toBeUndefined();
    expect(item.product.sku).toBeUndefined();
    expect(item.product.categoryId).toBeUndefined();
    expect(item.product.restaurantId).toBeUndefined();
    expect(item.product.createdAt).toBeUndefined();
  });

  it('404 — soft-deleted menu is not accessible', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu a borrar' })
      .expect(201);

    const deletedMenuId = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/v1/menus/${deletedMenuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/menus/${deletedMenuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });
});
