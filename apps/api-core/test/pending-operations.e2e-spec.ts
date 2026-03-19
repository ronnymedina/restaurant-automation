/**
 * E2E: Admin verification flow for sensitive user operations
 *
 * Flow under test:
 *  1. Bootstrap app with an isolated SQLite DB
 *  2. Create restaurant + admin via Prisma directly
 *  3. Login as admin → get JWT
 *  4. Request sensitive operation (create / delete / role-change)
 *     → API returns { pending: true }  (email would be sent in prod)
 *  5. Read the generated token from DB
 *  6. Confirm via GET /v1/users/confirm/:token (no auth required)
 *     → API executes the operation and returns { success: true }
 *  7. Verify the side-effect in the DB
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_DB = path.resolve(__dirname, 'test-pending-ops.db');

async function bootstrapApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${TEST_DB}`;

  // Push schema to the isolated test DB
  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();

  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

async function seedAdminAndRestaurant(prisma: PrismaService) {
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Test Restaurant', slug: `test-${Date.now()}` },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);
  const admin = await prisma.user.create({
    data: {
      email: `admin-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, admin };
}

async function loginAdmin(app: INestApplication<App>, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect((res) => { if (res.status !== 200 && res.status !== 201) throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`); });

  return res.body.accessToken as string;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Pending Operations — admin verification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let restaurantId: string;
  let adminEmail: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
    const { restaurant, admin } = await seedAdminAndRestaurant(prisma);
    restaurantId = restaurant.id;
    adminEmail = admin.email;
    token = await loginAdmin(app, adminEmail);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  // ── CREATE USER ────────────────────────────────────────────────────────────

  describe('POST /v1/users — create user', () => {
    const targetEmail = `new-user-${Date.now()}@test.com`;

    it('returns pending:true and does NOT create the user immediately', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: targetEmail, password: 'Pass1234!', role: 'BASIC' })
        .expect(201);

      expect(res.body.pending).toBe(true);
      expect(res.body.message).toContain('correo');

      const created = await prisma.user.findFirst({ where: { email: targetEmail } });
      expect(created).toBeNull();
    });

    it('confirms the operation and creates the user', async () => {
      const op = await prisma.pendingOperation.findFirst({
        where: { adminEmail, type: 'CREATE_USER' },
        orderBy: { createdAt: 'desc' },
      });
      expect(op).not.toBeNull();

      const res = await request(app.getHttpServer())
        .get(`/v1/users/confirm/${op!.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const created = await prisma.user.findFirst({ where: { email: targetEmail } });
      expect(created).not.toBeNull();
      expect(created!.role).toBe('BASIC');
      expect(created!.restaurantId).toBe(restaurantId);
    });

    it('returns 400 if token is used a second time', async () => {
      const op = await prisma.pendingOperation.findFirst({
        where: { adminEmail, type: 'CREATE_USER', confirmedAt: { not: null } },
        orderBy: { createdAt: 'desc' },
      });

      await request(app.getHttpServer())
        .get(`/v1/users/confirm/${op!.token}`)
        .expect(400);
    });
  });

  // ── DELETE USER ────────────────────────────────────────────────────────────

  describe('DELETE /v1/users/:id — delete user', () => {
    let victimId: string;

    beforeAll(async () => {
      const victim = await prisma.user.create({
        data: {
          email: `victim-${Date.now()}@test.com`,
          passwordHash: 'x',
          role: 'BASIC',
          isActive: true,
          restaurantId,
        },
      });
      victimId = victim.id;
    });

    it('returns pending:true and does NOT delete the user immediately', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/users/${victimId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.pending).toBe(true);

      const still = await prisma.user.findUnique({ where: { id: victimId } });
      expect(still).not.toBeNull();
    });

    it('confirms the operation and deletes the user', async () => {
      const op = await prisma.pendingOperation.findFirst({
        where: { adminEmail, type: 'DELETE_USER' },
        orderBy: { createdAt: 'desc' },
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/users/confirm/${op!.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // User is soft-deleted: record exists but deletedAt is set
      const gone = await prisma.user.findUnique({ where: { id: victimId } });
      expect(gone).not.toBeNull();
      expect(gone!.deletedAt).not.toBeNull();
    });
  });

  // ── UPDATE USER ROLE ───────────────────────────────────────────────────────

  describe('PATCH /v1/users/:id with role — change role', () => {
    let targetId: string;

    beforeAll(async () => {
      const target = await prisma.user.create({
        data: {
          email: `role-target-${Date.now()}@test.com`,
          passwordHash: 'x',
          role: 'BASIC',
          isActive: true,
          restaurantId,
        },
      });
      targetId = target.id;
    });

    it('returns pending:true and does NOT change the role immediately', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/users/${targetId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'MANAGER' })
        .expect(200);

      expect(res.body.pending).toBe(true);

      const unchanged = await prisma.user.findUnique({ where: { id: targetId } });
      expect(unchanged!.role).toBe('BASIC');
    });

    it('confirms the operation and updates the role', async () => {
      const op = await prisma.pendingOperation.findFirst({
        where: { adminEmail, type: 'UPDATE_USER_ROLE' },
        orderBy: { createdAt: 'desc' },
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/users/confirm/${op!.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const updated = await prisma.user.findUnique({ where: { id: targetId } });
      expect(updated!.role).toBe('MANAGER');
    });

    it('does NOT require confirmation for non-role patch (e.g. isActive)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/users/${targetId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false })
        .expect(200);

      // Regular update: returns the user directly, not a pending object
      expect(res.body.pending).toBeUndefined();
      expect(res.body.isActive).toBe(false);
    });
  });

  // ── TOKEN EXPIRY ───────────────────────────────────────────────────────────

  describe('Token expiry', () => {
    it('returns 400 when token has expired', async () => {
      const expired = await prisma.pendingOperation.create({
        data: {
          type: 'DELETE_USER',
          payload: JSON.stringify({ userId: 'non-existent' }),
          adminEmail,
          restaurantId,
          expiresAt: new Date(Date.now() - 1000), // already expired
        },
      });

      await request(app.getHttpServer())
        .get(`/v1/users/confirm/${expired.token}`)
        .expect(400);
    });

    it('returns 400 for a completely unknown token', async () => {
      await request(app.getHttpServer())
        .get('/v1/users/confirm/00000000-0000-0000-0000-000000000000')
        .expect(400);
    });
  });

  // ── AUTH GUARD ─────────────────────────────────────────────────────────────

  describe('Auth guard on sensitive endpoints', () => {
    it('returns 401 on POST /v1/users without token', async () => {
      await request(app.getHttpServer())
        .post('/v1/users')
        .send({ email: 'x@x.com', password: 'Pass1234!', role: 'BASIC' })
        .expect(401);
    });

    it('returns 401 on DELETE /v1/users/:id without token', async () => {
      await request(app.getHttpServer())
        .delete('/v1/users/some-id')
        .expect(401);
    });
  });
});
