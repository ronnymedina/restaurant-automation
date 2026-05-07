import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { bootstrapAppNoThrottle, uniqueEmail, uniqueName } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-conflicts.db');

describe('POST /v1/onboarding/register — conflictos 409 (e2e)', () => {
  let app: INestApplication<App>;

  const sharedEmail = uniqueEmail('shared');
  const sharedName = uniqueName('Shared');

  beforeAll(async () => {
    ({ app } = await bootstrapAppNoThrottle(TEST_DB));

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', sharedEmail)
      .field('restaurantName', sharedName)
      .field('timezone', 'UTC')
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('409 EMAIL_ALREADY_EXISTS — mismo email, nombre distinto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', sharedEmail)
      .field('restaurantName', uniqueName('Otro'))
      .field('timezone', 'UTC')
      .expect(409);

    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('409 RESTAURANT_NAME_ALREADY_EXISTS — mismo nombre, email distinto', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', sharedName)
      .field('timezone', 'UTC')
      .expect(409);

    expect(res.body.code).toBe('RESTAURANT_NAME_ALREADY_EXISTS');
  });

  it('EMAIL_ALREADY_EXISTS tiene precedencia sobre nombre duplicado', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', sharedEmail)
      .field('restaurantName', sharedName)
      .field('timezone', 'UTC')
      .expect(409);

    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });
});
