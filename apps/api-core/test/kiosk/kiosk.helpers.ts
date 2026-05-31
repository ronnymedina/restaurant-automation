// test/kiosk/kiosk.helpers.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import cookieParser from 'cookie-parser';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginCookie } from '../helpers/auth-cookie';

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
  app.use(cookieParser());
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
  const { accessCookie } = await loginCookie(app, email);
  return accessCookie;
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
  // Honor the "one OPEN shift per restaurant" invariant (audit H-45). See
  // orders.helpers.ts for the full rationale — close any pre-existing OPEN
  // shift before creating a new one so the partial unique index is happy.
  await prisma.cashShift.updateMany({
    where: { restaurantId, status: 'OPEN' },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  return prisma.cashShift.create({
    data: { restaurantId, userId },
  });
}
