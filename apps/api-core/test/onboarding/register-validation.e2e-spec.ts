import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { bootstrapAppNoThrottle } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-validation.db');

describe('POST /v1/onboarding/register — validaciones DTO (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await bootstrapAppNoThrottle(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('400 — email ausente', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('restaurantName', 'Mi Restaurante')
      .field('timezone', 'UTC')
      .expect(400);
  });

  it('400 — email con formato inválido', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', 'no-es-un-email')
      .field('restaurantName', 'Mi Restaurante')
      .field('timezone', 'UTC')
      .expect(400);
  });

  it('400 — timezone ausente', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', 'owner@test.com')
      .field('restaurantName', 'Mi Restaurante')
      .expect(400);
  });

  it('400 — timezone inválido (no es IANA)', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', 'owner@test.com')
      .field('restaurantName', 'Mi Restaurante')
      .field('timezone', 'Hora/Inventada')
      .expect(400);
  });

  it('400 — restaurantName ausente', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', 'owner@test.com')
      .field('timezone', 'UTC')
      .expect(400);
  });

  it('400 — restaurantName supera 60 caracteres', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', 'owner@test.com')
      .field('restaurantName', 'A'.repeat(61))
      .field('timezone', 'UTC')
      .expect(400);
  });

  it('400 — restaurantName contiene números', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', 'owner@test.com')
      .field('restaurantName', 'Restaurante 123')
      .field('timezone', 'UTC')
      .expect(400);
  });
});
