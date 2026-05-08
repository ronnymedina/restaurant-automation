import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { App } from 'supertest/types';
import { execSync } from 'child_process';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function bootstrapApp(): Promise<{
  moduleFixture: TestingModule;
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  execSync('pnpm exec prisma migrate deploy', {
    env: process.env,
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

export const uniqueEmail = (prefix = 'owner') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;

export const uniqueName = (prefix = 'Restaurante') => {
  const letters = Array.from({ length: 8 }, () =>
    'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('');
  return `${prefix} ${letters}`;
};

export async function registerUser(
  app: INestApplication<App>,
  email: string,
): Promise<void> {
  await request(app.getHttpServer())
    .post('/v1/onboarding/register')
    .field('email', email)
    .field('restaurantName', uniqueName())
    .field('timezone', 'UTC')
    .expect(201);
}

export async function activateUser(
  app: INestApplication<App>,
  prisma: PrismaService,
  email: string,
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user?.activationToken) throw new Error(`No activation token for ${email}`);

  await request(app.getHttpServer())
    .put('/v1/users/activate')
    .send({ token: user.activationToken, password: 'Password123' })
    .expect(200);
}
