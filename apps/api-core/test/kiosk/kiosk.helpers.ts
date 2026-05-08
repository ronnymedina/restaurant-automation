// test/kiosk/kiosk.helpers.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function bootstrapApp(dbPath: string): Promise<{
  moduleFixture: TestingModule;
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  process.env.DATABASE_URL = `file:${dbPath}`;

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { moduleFixture, app, prisma };
}

export async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Restaurant ${suffix} ${Date.now()}`,
      slug: `kiosk-${suffix}-${Date.now()}`,
    },
  });

  await prisma.restaurantSettings.create({
    data: { restaurantId: restaurant.id, timezone: 'UTC' },
  });

  const category = await prisma.productCategory.create({
    data: { name: 'General', restaurantId: restaurant.id },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `kiosk-admin-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, category, admin };
}

export async function login(
  app: INestApplication<App>,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect((r) => {
      if (r.status !== 200 && r.status !== 201)
        throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
  return res.body.accessToken as string;
}

export async function seedProduct(
  prisma: PrismaService,
  restaurantId: string,
  categoryId: string,
  overrides: { stock?: number | null } = {},
) {
  return prisma.product.create({
    data: {
      name: `Producto ${Date.now()}`,
      price: BigInt(1000),
      stock: overrides.stock !== undefined ? overrides.stock : 10,
      restaurantId,
      categoryId,
    },
  });
}

export async function seedMenu(
  prisma: PrismaService,
  restaurantId: string,
  productId: string,
) {
  return prisma.menu.create({
    data: {
      name: `Menú ${Date.now()}`,
      active: true,
      restaurantId,
      items: {
        create: [{ productId, sectionName: 'Principal', order: 0 }],
      },
    },
    include: { items: true },
  });
}

export async function openCashShift(
  prisma: PrismaService,
  restaurantId: string,
  userId: string,
) {
  return prisma.cashShift.create({
    data: { restaurantId, userId },
  });
}
