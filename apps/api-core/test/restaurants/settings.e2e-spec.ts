import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import cookieParser from 'cookie-parser';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginCookie, ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';

const TEST_DB = path.resolve(__dirname, 'test-settings.db');

async function bootstrapApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  });
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.use(cookieParser());
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: { name: `Restaurant ${suffix}`, slug: `rest-settings-${suffix}-${Date.now()}` },
  });
  await prisma.restaurantSettings.create({
    data: { restaurantId: restaurant.id, timezone: 'UTC' },
  });
  const passwordHash = await bcrypt.hash('Admin1234!', 10);
  const admin = await prisma.user.create({
    data: {
      email: `admin-settings-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });
  return { restaurant, admin };
}

/**
 * Login that also returns the timezone from the response body. The access
 * token is now delivered via httpOnly cookie, not the body; this helper
 * exposes the access cookie alongside the timezone so callers can both
 * authenticate and assert on the returned timezone.
 */
async function loginFull(
  app: INestApplication<App>,
  email: string,
): Promise<{ accessCookie: string; timezone: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .set('Origin', ALLOWED_TEST_ORIGIN)
    .send({ email, password: 'Admin1234!' });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  if (!Array.isArray(setCookie)) {
    throw new Error('Login did not return Set-Cookie headers');
  }
  const accessCookie = setCookie.find((c) => c.startsWith('access_token='));
  if (!accessCookie) {
    throw new Error(`Missing access cookie in Set-Cookie: ${setCookie.join(' | ')}`);
  }

  return {
    accessCookie: accessCookie.split(';')[0]!,
    timezone: res.body.timezone as string,
  };
}

describe('GET /v1/restaurants/settings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminCookie: string;
  let restaurantId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
    const { restaurant, admin } = await seedRestaurant(prisma, 'A');
    restaurantId = restaurant.id;
    const auth = await loginFull(app, admin.email);
    adminCookie = auth.accessCookie;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('returns 401 without cookie', async () => {
    await request(app.getHttpServer()).get('/v1/restaurants/settings').expect(401);
  });

  it('returns { timezone: "UTC" } for a default restaurant', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/restaurants/settings')
      .set('Cookie', adminCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    expect(res.body).toEqual({ timezone: 'UTC' });
  });

  it('returns updated timezone after settings change', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: { timezone: 'America/Mexico_City' },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/restaurants/settings')
      .set('Cookie', adminCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    expect(res.body).toEqual({ timezone: 'America/Mexico_City' });
  });

  it('login response includes the restaurant timezone field', async () => {
    const { restaurant, admin } = await seedRestaurant(prisma, 'B');
    await prisma.restaurantSettings.update({
      where: { restaurantId: restaurant.id },
      data: { timezone: 'America/Argentina/Buenos_Aires' },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ email: admin.email, password: 'Admin1234!' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201)
          throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
      });

    expect(res.body.timezone).toBe('America/Argentina/Buenos_Aires');
  });
});
