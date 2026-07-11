import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, uniqueName } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-demo.db');

describe('POST /v1/onboarding/register — createDemoData (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('201 — createDemoData=true devuelve { productsCreated: 5 }', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .field('createDemoData', 'true')
      .expect(201);

    expect(res.body.productsCreated).toBe(5);
  });

  it('crea exactamente 5 productos en BD', async () => {
    const name = uniqueName('Demo Prod');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', name)
      .field('timezone', 'UTC')
      .field('createDemoData', 'true')
      .expect(201);

    const restaurant = await prisma.restaurant.findFirst({ where: { name } });
    const products = await prisma.product.findMany({ where: { restaurantId: restaurant!.id } });
    expect(products).toHaveLength(5);
  });

  it('crea 1 menú activo llamado Menú Principal', async () => {
    const name = uniqueName('Demo Menu');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', name)
      .field('timezone', 'UTC')
      .field('createDemoData', 'true')
      .expect(201);

    const restaurant = await prisma.restaurant.findFirst({ where: { name } });
    const menus = await prisma.menu.findMany({ where: { restaurantId: restaurant!.id } });
    expect(menus).toHaveLength(1);
    expect(menus[0].name).toBe('Menú Principal');
    expect(menus[0].active).toBe(true);
  });

  it('los productos quedan enlazados al menú via MenuItem', async () => {
    const name = uniqueName('Demo Items');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', name)
      .field('timezone', 'UTC')
      .field('createDemoData', 'true')
      .expect(201);

    const restaurant = await prisma.restaurant.findFirst({ where: { name } });
    const menu = await prisma.menu.findFirst({ where: { restaurantId: restaurant!.id } });
    const items = await prisma.menuItem.findMany({ where: { menuId: menu!.id } });
    expect(items).toHaveLength(5);
  });
});
