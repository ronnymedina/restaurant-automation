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

  beforeAll(async () => {
    ({ app } = await bootstrapAppNoThrottle(TEST_DB));

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', sharedEmail)
      .field('restaurantName', uniqueName('Shared'))
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

  it('dos restaurantes pueden tener el mismo nombre si el email es distinto', async () => {
    const sameName = uniqueName('Mismo Nombre');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail('name-dup-a'))
      .field('restaurantName', sameName)
      .field('timezone', 'UTC')
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail('name-dup-b'))
      .field('restaurantName', sameName)
      .field('timezone', 'UTC')
      .expect(201);
  });
});
