import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../src/prisma/prisma.service';
import { productConfig } from '../../src/products/product.config';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-list-products.db');

describe('GET /v1/products - listProducts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let moduleFixture: TestingModule;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let categoryIdA: string;
  let adminTokenB: string;

  let productA1: any;
  let productA2: any;
  let productA3: any;

  beforeAll(async () => {
    ({ moduleFixture, app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);

    productA1 = await prisma.product.create({
      data: { name: 'Prod A1', price: 1000n, categoryId: categoryIdA, restaurantId: restA.restaurant.id },
    });
    await new Promise((r) => setTimeout(r, 50));

    productA2 = await prisma.product.create({
      data: { name: 'Prod A2', price: 2000n, categoryId: categoryIdA, restaurantId: restA.restaurant.id },
    });
    await new Promise((r) => setTimeout(r, 50));

    productA3 = await prisma.product.create({
      data: { name: 'Prod A3', price: 3000n, categoryId: categoryIdA, restaurantId: restA.restaurant.id },
    });
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/products').expect(401);
  });

  it('Permite el acceso a ADMIN, MANAGER y BASIC', async () => {
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${adminTokenA}`).expect(200);
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${managerTokenA}`).expect(200);
    await request(app.getHttpServer()).get('/v1/products').set('Authorization', `Bearer ${basicTokenA}`).expect(200);
  });

  it('Respeta el límite máximo de paginación configurado', async () => {
    const config = app.get(productConfig.KEY);
    const maxLimit = config.maxPageSize;

    const res = await request(app.getHttpServer())
      .get('/v1/products?limit=100')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res.body.meta.limit).toBe(maxLimit);
    expect(res.body.data.length).toBeLessThanOrEqual(maxLimit);
  });

  it('Devuelve los productos en orden descendente (más nuevo primero)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const items = res.body.data;
    expect(items[0].id).toBe(productA3.id);
    expect(items[1].id).toBe(productA2.id);
    expect(items[2].id).toBe(productA1.id);
  });

  it('Estructura ProductListSerializer: price como number, category.name, sin updatedAt/deletedAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const product = res.body.data[0];

    expect(product.id).toBeDefined();
    expect(product.name).toBeDefined();
    expect(typeof product.price).toBe('number');
    expect(product.category).toBeDefined();
    expect(product.category.name).toBeDefined();
    expect(product.category.id).toBeUndefined();
    expect(product.updatedAt).toBeUndefined();
    expect(product.deletedAt).toBeUndefined();
  });

  it('Valida estrictamente las propiedades expuestas (opt-in)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const product = res.body.data[0];
    const expectedKeys = [
      'id', 'name', 'description', 'price', 'stock',
      'sku', 'imageUrl', 'active', 'categoryId',
      'restaurantId', 'createdAt', 'category',
    ].sort();

    expect(Object.keys(product).sort()).toEqual(expectedKeys);
    expect(Object.keys(product.category).sort()).toEqual(['name']);
  });

  it('Devuelve resultados de la página solicitada', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/v1/products?page=1&limit=2')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .get('/v1/products?page=2&limit=2')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(res1.body.meta.page).toBe(1);
    expect(res2.body.meta.page).toBe(2);
    expect(res1.body.data.length).toBe(2);
    expect(res2.body.data.length).toBe(1);
    expect(res1.body.data[0].id).not.toBe(res2.body.data[0].id);
  });

  it('No devuelve productos con soft delete (deletedAt != null)', async () => {
    await prisma.product.update({
      where: { id: productA2.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).toContain(productA1.id);
    expect(ids).toContain(productA3.id);
    expect(ids).not.toContain(productA2.id);
  });

  it('Solo devuelve productos del propio restaurante', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
});
