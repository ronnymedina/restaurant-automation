import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { App } from 'supertest/types';
import { execSync } from 'child_process';
import { ThrottlerStorage } from '@nestjs/throttler';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GeminiService } from '../../src/ai/gemini.service';

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

export async function bootstrapAppWithGeminiMock(
  dbPath: string,
  mockProducts: Array<{ name: string; price?: number; description?: string }>,
): Promise<{ moduleFixture: TestingModule; app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${dbPath}`;

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GeminiService)
    .useValue({ extractProductsFromMultipleImages: jest.fn().mockResolvedValue(mockProducts) })
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { moduleFixture, app, prisma };
}

export async function bootstrapAppNoThrottle(dbPath: string): Promise<{
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
  })
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: jest.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
      getRecord: jest.fn().mockResolvedValue([]),
    })
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { moduleFixture, app, prisma };
}

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const randomLetters = (len = 8) =>
  Array.from({ length: len }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export const uniqueEmail = (prefix = 'owner') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
export const uniqueName = (prefix = 'Restaurante') =>
  `${prefix} ${randomLetters()}`;
