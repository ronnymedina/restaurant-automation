import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-findone-product.db');

describe('GET /v1/products/:id - findOneProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;

  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);

    const product = await prisma.product.create({
      data: {
        name: 'Producto Test',
        price: 1500n,
        categoryId: restA.category.id,
        restaurantId: restA.restaurant.id,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .expect(401);
  });

  it('ADMIN puede obtener un producto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
  });

  it('MANAGER puede obtener un producto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
  });

  it('BASIC puede obtener un producto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
  });

  it('Estructura ProductSerializer: price como number, sin category, sin updatedAt/deletedAt', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
    expect(typeof res.body.price).toBe('number');
    expect(res.body.category).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
  });

  it('Valida estrictamente las propiedades expuestas (opt-in)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt',
    ].sort();

    expect(Object.keys(res.body).sort()).toEqual(expectedKeys);
  });

  it('Devuelve price como number serializado desde centavos (1500 centavos → 15)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.price).toBe(15);
  });

  it('Producto no existe → 404', async () => {
    await request(app.getHttpServer())
      .get('/v1/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('Producto de otro restaurante → 404 (aislamiento)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(404);
  });
});
