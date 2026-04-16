import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-create-product.db');

describe('POST /v1/products - createProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let categoryIdA: string;
  let categoryIdB: string;

  const validPayload = (catId: string) => ({
    name: 'Hamburguesa Clásica',
    description: 'Con lechuga y tomate',
    price: 1250,
    stock: 50,
    sku: 'HAM-001',
    categoryId: catId,
  });

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    categoryIdB = restB.category.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .send(validPayload(categoryIdA))
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send(validPayload(categoryIdA))
      .expect(403);
  });

  it('ADMIN puede crear un producto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), name: 'Producto Admin', sku: 'ADM-001' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Producto Admin');
  });

  it('MANAGER puede crear un producto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ ...validPayload(categoryIdA), name: 'Producto Manager', sku: 'MGR-001' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Producto Manager');
  });

  it('Transformación centavos: price=1250 en request → 12.5 en response', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: 1250, name: 'Test Centavos', sku: 'CENTS-001' })
      .expect(201);

    expect(res.body.price).toBe(12.5);
    expect(typeof res.body.price).toBe('number');
  });

  it('price=0 es válido (producto gratis)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: 0, name: 'Producto Gratis', sku: 'FREE-001' })
      .expect(201);

    expect(res.body.price).toBe(0);
  });

  it('Estructura ProductSerializer (campos exactos, sin updatedAt/deletedAt)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), name: 'Test Serializer', sku: 'SER-001' })
      .expect(201);

    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt',
    ].sort();

    expect(Object.keys(res.body).sort()).toEqual(expectedKeys);
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
  });

  it('name vacío → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), name: '' })
      .expect(400);
  });

  it('price negativo → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: -100 })
      .expect(400);
  });

  it('price decimal (no entero) → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), price: 12.5 })
      .expect(400);
  });

  it('stock negativo → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), stock: -1 })
      .expect(400);
  });

  it('stock > 9999 → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), stock: 10000 })
      .expect(400);
  });

  it('description > 500 chars → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), description: 'x'.repeat(501) })
      .expect(400);
  });

  it('sku > 50 chars → 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdA), sku: 'A'.repeat(51) })
      .expect(400);
  });

  it('categoryId de otro restaurante → 404 (aislamiento)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ ...validPayload(categoryIdB), name: 'Cross Restaurant', sku: 'CROSS-001' })
      .expect(404);

    expect(res.body.code).toBe('ENTITY_NOT_FOUND');
  });
});
