// test/cash-register/cash-register.helpers.ts
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
      slug: `rest-${suffix}-${Date.now()}`,
    },
  });

  const category = await prisma.productCategory.create({
    data: { name: 'General', restaurantId: restaurant.id, isDefault: false },
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

  return { restaurant, category, admin, manager, basic };
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
) {
  return prisma.product.create({
    data: {
      name: `Producto ${Date.now()}`,
      price: BigInt(1000),
      stock: 10,
      restaurantId,
      categoryId,
    },
  });
}

export async function openCashShiftViaApi(
  app: INestApplication<App>,
  token: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/cash-register/open')
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  return res.body.id as string;
}

export async function seedOrderOnShift(
  prisma: PrismaService,
  restaurantId: string,
  cashShiftId: string,
  productId: string,
) {
  const updatedShift = await prisma.cashShift.update({
    where: { id: cashShiftId },
    data: { lastOrderNumber: { increment: 1 } },
  });

  return prisma.order.create({
    data: {
      orderNumber: updatedShift.lastOrderNumber,
      restaurantId,
      cashShiftId,
      totalAmount: BigInt(1000),
      items: {
        create: [{ productId, quantity: 1, unitPrice: BigInt(1000), subtotal: BigInt(1000) }],
      },
    },
  });
}
