import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function bootstrapApp(
  dbPath: string,
): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${dbPath}`;

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
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

export async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const ts = Date.now();

  const restaurant = await prisma.restaurant.create({
    data: { name: `RestMenu ${suffix} ${ts}`, slug: `rest-menu-${suffix}-${ts}` },
  });

  await prisma.restaurantSettings.create({
    data: { restaurantId: restaurant.id, timezone: 'UTC' },
  });

  const defaultCategory = await prisma.productCategory.create({
    data: { name: 'Sin categoría', restaurantId: restaurant.id, isDefault: true },
  });

  const product = await prisma.product.create({
    data: {
      name: 'Lomo al trapo',
      price: 1500n,
      restaurantId: restaurant.id,
      categoryId: defaultCategory.id,
    },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `admin-menu-${suffix}-${ts}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: `manager-menu-${suffix}-${ts}@test.com`,
      passwordHash,
      role: 'MANAGER',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const basic = await prisma.user.create({
    data: {
      email: `basic-menu-${suffix}-${ts}@test.com`,
      passwordHash,
      role: 'BASIC',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, defaultCategory, product, admin, manager, basic };
}

export async function login(app: INestApplication<App>, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect((r) => {
      if (r.status !== 200 && r.status !== 201)
        throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
  return res.body.accessToken as string;
}

export const TEST_DB_DIR = path.resolve(__dirname);
