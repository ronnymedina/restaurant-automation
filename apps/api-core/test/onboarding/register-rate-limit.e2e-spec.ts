import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { bootstrapApp, uniqueEmail, uniqueName } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-ratelimit.db');

describe('POST /v1/onboarding/register — rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  const labels = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('los primeros 5 requests retornan 201', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/v1/onboarding/register')
        .field('email', uniqueEmail(`rl-${i}`))
        .field('restaurantName', uniqueName(`RateLimit${labels[i]}`))
        .field('timezone', 'UTC')
        .expect(201);
    }
  });

  it('el 6° request retorna 429 (misma IP, dentro de la ventana de 15min)', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail('rl-six'))
      .field('restaurantName', uniqueName('RateLimitf'))
      .field('timezone', 'UTC')
      .expect(429);
  });
});
