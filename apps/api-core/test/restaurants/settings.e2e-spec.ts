import request from 'supertest';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginCookie, ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';

const TEST_DB = path.resolve(__dirname, 'test-settings.db');

async function bootstrapApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  execSync('pnpm exec prisma migrate deploy', {
    env: process.env,
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
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.menu.deleteMany();
    await prisma.product.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.restaurantSettings.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.restaurant.deleteMany();
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

    expect(res.body).toMatchObject({ timezone: 'UTC' });
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

    expect(res.body).toMatchObject({ timezone: 'America/Mexico_City' });
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

describe('PATCH /v1/restaurants/settings', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.menu.deleteMany();
    await prisma.product.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.restaurantSettings.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.restaurant.deleteMany();
  });

  it('401 without token', async () => {
    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ currency: 'USD' })
      .expect(401);
  });

  it('403 when caller is MANAGER', async () => {
    const { restaurant } = await seedRestaurant(prisma, 'mgr');
    const passwordHash = await bcrypt.hash('Manager1234!', 10);
    const manager = await prisma.user.create({
      data: {
        email: `manager-${Date.now()}@test.com`,
        passwordHash, role: 'MANAGER', isActive: true,
        restaurantId: restaurant.id,
      },
    });
    const { accessCookie } = await loginCookie(app, manager.email, 'Manager1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ currency: 'USD' })
      .expect(403);
  });

  it('200 with empty body — no-op', async () => {
    const { admin } = await seedRestaurant(prisma, 'empty');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({ country: 'CL' });
  });

  it('200 updates currency to a valid ISO 4217 code', async () => {
    const { admin } = await seedRestaurant(prisma, 'cur');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ currency: 'USD' })
      .expect(200);

    expect(res.body.currency).toBe('USD');
  });

  it('400 on invalid currency code', async () => {
    const { admin } = await seedRestaurant(prisma, 'badcur');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ currency: 'XXX' })
      .expect(400);
  });

  it('200 derives thousandsSeparator from decimalSeparator (. → ,)', async () => {
    const { admin } = await seedRestaurant(prisma, 'sep');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ decimalSeparator: '.' })
      .expect(200);

    expect(res.body.decimalSeparator).toBe('.');
    expect(res.body.thousandsSeparator).toBe(',');
  });

  it('400 on disallowed decimalSeparator', async () => {
    const { admin } = await seedRestaurant(prisma, 'badsep');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ decimalSeparator: ';' })
      .expect(400);
  });

  it('200 updates timezone that belongs to the country', async () => {
    const { admin } = await seedRestaurant(prisma, 'tz');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ timezone: 'America/Santiago' })
      .expect(200);

    expect(res.body.timezone).toBe('America/Santiago');
  });

  it('400 TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY when timezone is foreign to country', async () => {
    const { admin } = await seedRestaurant(prisma, 'badtz');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ timezone: 'America/New_York' })
      .expect(400);

    expect(res.body.code).toBe('TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY');
  });

  it('200 renames the restaurant and regenerates slug', async () => {
    const { restaurant, admin } = await seedRestaurant(prisma, 'name');
    const oldSlug = restaurant.slug;
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Mi Resto Renombrado' })
      .expect(200);

    expect(res.body.name).toBe('Mi Resto Renombrado');
    expect(res.body.slug).not.toBe(oldSlug);
    expect(res.body.slug.startsWith('mi-resto-renombrado')).toBe(true);
  });

  it('400 on empty name', async () => {
    const { admin } = await seedRestaurant(prisma, 'emptyname');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: '' })
      .expect(400);
  });

  it('400 on name longer than 255 chars', async () => {
    const { admin } = await seedRestaurant(prisma, 'longname');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'x'.repeat(256) })
      .expect(400);
  });

  it('admin of B only affects B (cross-tenant isolation)', async () => {
    const { restaurant: a } = await seedRestaurant(prisma, 'A');
    const { admin: adminB } = await seedRestaurant(prisma, 'B');
    const { accessCookie: accessCookieB } = await loginCookie(app, adminB.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', accessCookieB)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'B Renamed' })
      .expect(200);

    const aAfter = await prisma.restaurant.findUnique({ where: { id: a.id } });
    expect(aAfter?.name).toBe(a.name);
    expect(aAfter?.slug).toBe(a.slug);
  });
});

describe('GET /v1/restaurants/settings — extended shape', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => { ({ app, prisma } = await bootstrapApp()); });
  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.menu.deleteMany();
    await prisma.product.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.restaurantSettings.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.restaurant.deleteMany();
  });

  it('returns name and slug along with settings', async () => {
    const { restaurant, admin } = await seedRestaurant(prisma, 'shape');
    const { accessCookie } = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .get('/v1/restaurants/settings')
      .set('Cookie', accessCookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    expect(res.body).toMatchObject({
      name: restaurant.name,
      slug: restaurant.slug,
      country: 'CL',
    });
    expect(res.body.timezone).toBeDefined();
  });
});
