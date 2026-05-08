import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, uniqueName } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-register.db');

describe('POST /v1/onboarding/register — registro básico (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('201 — registro sin foto devuelve { productsCreated: 0 }', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', uniqueName())
      .field('timezone', 'America/Argentina/Buenos_Aires')
      .expect(201);

    expect(res.body).toEqual({ productsCreated: 0 });
  });

  it('la respuesta solo contiene el campo productsCreated', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .expect(201);

    expect(Object.keys(res.body)).toEqual(['productsCreated']);
  });

  it('crea el restaurante en BD con status CREATED', async () => {
    const name = uniqueName('Status Test');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', name)
      .field('timezone', 'UTC')
      .expect(201);

    const restaurant = await prisma.restaurant.findFirst({ where: { name } });
    expect(restaurant).toBeTruthy();
    expect(restaurant!.status).toBe('CREATED');
  });

  it('crea RestaurantSettings con el timezone enviado en el request', async () => {
    const name = uniqueName('Timezone Test');
    const timezone = 'America/Bogota';

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', name)
      .field('timezone', timezone)
      .expect(201);

    const restaurant = await prisma.restaurant.findFirst({
      where: { name },
      include: { settings: true },
    });
    expect(restaurant!.settings!.timezone).toBe(timezone);
  });

  it('crea usuario con rol MANAGER, isActive false y activationToken', async () => {
    const email = uniqueEmail('manager-check');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', email)
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .expect(201);

    const user = await prisma.user.findFirst({ where: { email } });
    expect(user!.role).toBe('MANAGER');
    expect(user!.isActive).toBe(false);
    expect(user!.activationToken).toBeTruthy();
  });
});
