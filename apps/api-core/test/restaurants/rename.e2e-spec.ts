/**
 * E2E: Restaurant rename — PATCH /v1/restaurants/name
 *
 * Cases covered:
 *  1. ADMIN can rename their restaurant → 200, returns { slug }
 *  2. MANAGER is rejected → 403
 *  3. BASIC user is rejected → 403
 *  4. Unauthenticated request → 401
 *  5. Name shorter than 3 chars → 400
 *  6. Name longer than 255 chars → 400
 *  7. Cross-restaurant isolation: Restaurant B's admin cannot affect Restaurant A
 *
 * Pending (requires business decision):
 *  - Validate that the new name is not already used by another restaurant
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import cookieParser from 'cookie-parser';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginCookie, ALLOWED_TEST_ORIGIN } from '../helpers/auth-cookie';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_DB = path.resolve(__dirname, 'test-rename.db');

async function bootstrapApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${TEST_DB}`;

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.use(cookieParser());
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: { name: `Restaurant ${suffix}`, slug: `rest-${suffix}-${Date.now()}` },
  });

  await prisma.restaurantSettings.create({
    data: { restaurantId: restaurant.id, timezone: 'UTC' },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: `manager-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'MANAGER',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const basic = await prisma.user.create({
    data: {
      email: `basic-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'BASIC',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, admin, manager, basic };
}

async function login(app: INestApplication<App>, email: string): Promise<string> {
  const { accessCookie } = await loginCookie(app, email);
  return accessCookie;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Restaurant rename (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;
  let restaurantAId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const seedA = await seedRestaurant(prisma, 'A');
    const seedB = await seedRestaurant(prisma, 'B');

    restaurantAId = seedA.restaurant.id;

    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);
    adminTokenB   = await login(app, seedB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  // ── Role guard ──────────────────────────────────────────────────────────────

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Nuevo Nombre' })
      .expect(401);
  });

  it('403 — MANAGER cannot rename the restaurant', async () => {
    await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', managerTokenA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Nuevo Nombre Manager' })
      .expect(403);
  });

  it('403 — BASIC user cannot rename the restaurant', async () => {
    await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', basicTokenA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Nuevo Nombre Basic' })
      .expect(403);
  });

  // ── DTO validation ──────────────────────────────────────────────────────────

  it('400 — name shorter than 3 characters is rejected', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', adminTokenA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'AB' })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('3 caracteres')]),
    );
  });

  it('400 — name longer than 255 characters is rejected', async () => {
    const longName = 'A'.repeat(256);
    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', adminTokenA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: longName })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('255 caracteres')]),
    );
  });

  it('400 — missing name field is rejected', async () => {
    await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', adminTokenA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({})
      .expect(400);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('200 — ADMIN can rename their restaurant and receives new slug', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', adminTokenA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Mi Restaurante Renombrado' })
      .expect(200);

    expect(res.body).toHaveProperty('slug');
    expect(typeof res.body.slug).toBe('string');
    expect(res.body.slug.length).toBeGreaterThan(0);

    const updated = await prisma.restaurant.findUnique({ where: { id: restaurantAId } });
    expect(updated?.name).toBe('Mi Restaurante Renombrado');
  });

  // ── Cross-restaurant isolation ──────────────────────────────────────────────

  it('200 — Restaurant B admin renames only their own restaurant, not A', async () => {
    const nameBefore = await prisma.restaurant.findUnique({ where: { id: restaurantAId } });

    await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', adminTokenB)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Nombre Desde Restaurante B' })
      .expect(200);

    const nameAfter = await prisma.restaurant.findUnique({ where: { id: restaurantAId } });
    expect(nameAfter?.name).toBe(nameBefore?.name);
  });

  // ── Name uniqueness ──────────────────────────────────────────────────────────

  it('409 DUPLICATE_RESTAURANT — renaming to a name already used by another restaurant is rejected', async () => {
    const restaurantB = await prisma.restaurant.findFirst({
      where: { id: { not: restaurantAId } },
    });

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/name')
      .set('Cookie', adminTokenA)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: restaurantB!.name })
      .expect(409);

    expect(res.body.code).toBe('DUPLICATE_RESTAURANT');
  });
});
