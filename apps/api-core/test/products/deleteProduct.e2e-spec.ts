import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './products.helpers';

const TEST_DB = path.resolve(__dirname, 'test-delete-product.db');

describe('DELETE /v1/products/:id - deleteProduct (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let categoryIdA: string;
  let restaurantIdA: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const restA = await seedRestaurant(prisma, 'A');
    categoryIdA = restA.category.id;
    restaurantIdA = restA.restaurant.id;
    adminTokenA = await login(app, restA.admin.email);
    managerTokenA = await login(app, restA.manager.email);
    basicTokenA = await login(app, restA.basic.email);

    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  async function createProduct(name: string): Promise<string> {
    const product = await prisma.product.create({
      data: { name, price: 1000n, categoryId: categoryIdA, restaurantId: restaurantIdA },
    });
    return product.id;
  }

  it('Sin token recibe 401', async () => {
    const id = await createProduct('Producto 401');
    await request(app.getHttpServer()).delete(`/v1/products/${id}`).expect(401);
  });

  it('BASIC recibe 403', async () => {
    const id = await createProduct('Producto BASIC');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(403);
  });

  it('ADMIN elimina (soft delete) → 204 sin body', async () => {
    const id = await createProduct('Producto Admin Delete');
    const res = await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    expect(res.body).toEqual({});
    expect(res.text).toBe('');
  });

  it('MANAGER elimina (soft delete) → 204 sin body', async () => {
    const id = await createProduct('Producto Manager Delete');
    const res = await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(204);

    expect(res.body).toEqual({});
    expect(res.text).toBe('');
  });

  it('Soft delete setea deletedAt en BD', async () => {
    const id = await createProduct('Producto Con DeletedAt');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const product = await prisma.product.findUnique({ where: { id } });
    expect(product).not.toBeNull();
    expect(product!.deletedAt).not.toBeNull();
  });

  it('Producto soft-deleted no aparece en listado', async () => {
    const id = await createProduct('Producto Para Listar');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).not.toContain(id);
  });

  it('Producto soft-deleted devuelve 404 en GET /:id', async () => {
    const id = await createProduct('Producto Para GET 404');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('Producto no existe → 404', async () => {
    await request(app.getHttpServer())
      .delete('/v1/products/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(404);
  });

  it('Producto de otro restaurante → 404 (aislamiento)', async () => {
    const id = await createProduct('Producto Aislamiento');
    await request(app.getHttpServer())
      .delete(`/v1/products/${id}`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(404);
  });
});
