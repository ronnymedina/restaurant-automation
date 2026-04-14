// apps/api-core/test/uploads/uploadImage.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './uploads.helpers';

const TEST_DB = path.resolve(__dirname, 'test-upload-image.db');

// Minimal 1x1 white JPEG (valid image, ~600 bytes)
const SMALL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
  'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJ' +
  'CQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQAAB//2Q==',
  'base64',
);

describe('POST /v1/uploads/image (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const rest = await seedRestaurant(prisma, 'U');
    adminToken   = await login(app, rest.admin.email);
    managerToken = await login(app, rest.manager.email);
    basicToken   = await login(app, rest.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .attach('file', SMALL_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${basicToken}`)
      .attach('file', SMALL_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('ADMIN puede subir JPG y recibe url', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', SMALL_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body.url).toMatch(/^\/uploads\/products\/.+\.jpg$/);
  });

  it('MANAGER puede subir PNG y recibe url', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${managerToken}`)
      .attach('file', SMALL_JPEG, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);

    expect(res.body.url).toMatch(/^\/uploads\/products\/.+\.png$/);
  });

  it('ADMIN puede subir WEBP y recibe url', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      // Buffer is JPEG bytes with image/webp MIME — validates header-based MIME filter (known limitation: no magic bytes check)
      .attach('file', SMALL_JPEG, { filename: 'photo.webp', contentType: 'image/webp' })
      .expect(201);

    expect(res.body.url).toMatch(/^\/uploads\/products\/.+\.webp$/);
  });

  it('Sin archivo recibe 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('Tipo no permitido (PDF) recibe 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'doc.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('Archivo mayor a 2MB recibe 413', async () => {
    const bigBuffer = Buffer.alloc(3 * 1024 * 1024); // 3MB
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' })
      .expect(413);
  });
});
