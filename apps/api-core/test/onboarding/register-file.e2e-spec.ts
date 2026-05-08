import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { bootstrapAppNoThrottle, uniqueEmail, uniqueName } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-file.db');

describe('POST /v1/onboarding/register — validación de archivo (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await bootstrapAppNoThrottle(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('400 — archivo mayor a 5MB es rechazado', async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'x');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .attach('photo', largeBuffer, { filename: 'menu.jpg', contentType: 'image/jpeg' })
      .expect(400);
  });

  it('400 — tipo de archivo inválido (PDF) es rechazado', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');

    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .attach('photo', pdfBuffer, { filename: 'menu.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('201 — JPEG válido y pequeño es aceptado (Gemini retorna 0 sin API key)', async () => {
    const tinyJpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
      'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
      'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
      'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
      'AAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA' +
      '/9oADAMBAAIRAxEAPwCwABmX/9k=',
      'base64',
    );

    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', uniqueEmail())
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .attach('photo', tinyJpeg, { filename: 'menu.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body.productsCreated).toBe(0);
  });
});
