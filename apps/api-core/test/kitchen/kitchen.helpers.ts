// test/kitchen/kitchen.helpers.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import cookieParser from 'cookie-parser';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { KitchenTokenService } from '../../src/kitchen/kitchen-token.service';

export async function bootstrapApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  execSync('pnpm exec prisma migrate deploy', { env: process.env, stdio: 'pipe' });

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

export async function seedRestaurantWithToken(prisma: PrismaService, suffix: string) {
  const slug = `kitchen-${suffix}-${Date.now()}`;
  const tokenService = new KitchenTokenService();
  const { plainToken, tokenHash } = tokenService.generate();
  const token = plainToken;

  const restaurant = await prisma.restaurant.create({
    data: { name: `Kitchen Test ${suffix}`, slug },
  });

  await prisma.restaurantSettings.create({
    data: {
      restaurantId: restaurant.id,
      timezone: 'UTC',
      kitchenTokenHash: tokenHash,
      kitchenTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const category = await prisma.productCategory.create({
    data: { name: 'General', restaurantId: restaurant.id },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);
  const admin = await prisma.user.create({
    data: {
      email: `kitchen-admin-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN' as any,
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, slug, token, category, admin };
}

export async function openCashShift(prisma: PrismaService, restaurantId: string, userId: string) {
  // Honor the "one OPEN shift per restaurant" invariant (audit H-45). See
  // orders.helpers.ts for the full rationale.
  await prisma.cashShift.updateMany({
    where: { restaurantId, status: 'OPEN' },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  return prisma.cashShift.create({ data: { restaurantId, userId } });
}

export async function seedProduct(prisma: PrismaService, restaurantId: string, categoryId: string) {
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

export async function seedOrder(
  prisma: PrismaService,
  restaurantId: string,
  cashShiftId: string,
  productId: string,
  overrides: { status?: string } = {},
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
      status: (overrides.status as any) ?? 'CONFIRMED',
      isPaid: false,
      orderSource: 'STAFF',
      orderType: 'PICKUP',
      items: {
        create: [{ productId, quantity: 1, unitPrice: BigInt(1000), subtotal: BigInt(1000) }],
      },
    },
    include: { items: true },
  });
}
