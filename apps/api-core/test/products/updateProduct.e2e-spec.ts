import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-update-product.db');

describe('PATCH /v1/products/:id - updateProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let categoryIdA: string;
  let categoryIdB: string;

  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    categoryIdB = restB.category.id;
    adminTokenB = await login(app, restB.admin.email);

    const product = await prisma.product.create({
      data: {
        name: 'Producto Original',
        price: 1000n,
        categoryId: categoryIdA,
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
      .patch(`/v1/products/${productId}`)
      .send({ name: 'Nuevo Nombre' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .send({ name: 'Intento BASIC' })
      .expect(403);
  });

  it('ADMIN puede actualizar nombre', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Nombre Actualizado Admin' })
      .expect(200);

    expect(res.body.name).toBe('Nombre Actualizado Admin');
  });

  it('MANAGER puede actualizar precio', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .send({ price: 2000 })
      .expect(200);

    // 2000 centavos → $20.00 serializado
    expect(res.body.price).toBe(20);
  });

  it('Transformación centavos al actualizar precio: 500 → 5', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ price: 500 })
      .expect(200);

    expect(res.body.price).toBe(5);
    expect(typeof res.body.price).toBe('number');
  });

  it('Respuesta es ProductSerializer (campos exactos, sin updatedAt/deletedAt)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Test Serializer Update' })
      .expect(200);

    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt',
    ].sort();

    expect(Object.keys(res.body).sort()).toEqual(expectedKeys);
    expect(res.body.updatedAt).toBeUndefined();
    expect(res.body.deletedAt).toBeUndefined();
  });

  it('Producto no existe → 404', async () => {
    await request(app.getHttpServer())
      .patch('/v1/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'No importa' })
      .expect(404);
  });

  it('Producto de otro restaurante → 404 (aislamiento)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ name: 'Hack intento' })
      .expect(404);
  });

  it('categoryId de otro restaurante → 404 (aislamiento)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/products/${productId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ categoryId: categoryIdB })
      .expect(404);

    expect(res.body.code).toBe('ENTITY_NOT_FOUND');
  });
});
