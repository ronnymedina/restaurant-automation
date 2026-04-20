import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './uploads.helpers';

const TEST_DB = path.resolve(__dirname, 'test-presign.db');

const SMALL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
  'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJ' +
  'CQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQAAB//2Q==',
  'base64',
);

describe('Uploads presign flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let restaurantId: string;

  beforeAll(async () => {
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.UPLOAD_PRESIGN_EXPIRY_SECONDS = '120';

    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const rest = await seedRestaurant(prisma, 'P');
    restaurantId = rest.restaurant.id;
    adminToken = await login(app, rest.admin.email);
    basicToken = await login(app, rest.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  describe('POST /v1/uploads/presign', () => {
    it('sin token recibe 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .send({ mimetype: 'image/jpeg' })
        .expect(401);
    });

    it('BASIC recibe 403', async () => {
      await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${basicToken}`)
        .send({ mimetype: 'image/jpeg' })
        .expect(403);
    });

    it('ADMIN obtiene presignedUrl y publicUrl para image/jpeg', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype: 'image/jpeg' })
        .expect(201);

      expect(res.body.presignedUrl).toMatch(/\/v1\/uploads\/local-put\/.+/);
      expect(res.body.publicUrl).toMatch(/^\/uploads\/restaurants\/.+\.jpg$/);
    });

    it('presignedUrl contiene token con key y publicUrl correctos', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype: 'image/png' })
        .expect(201);

      const token = res.body.presignedUrl.split('/').pop();
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { key: string; publicUrl: string };

      expect(payload.key).toMatch(new RegExp(`^restaurants/${restaurantId}/[0-9a-f-]{36}\\.png$`));
      expect(payload.publicUrl).toMatch(/^\/uploads\/restaurants\/.+\.png$/);
    });

    it('mimetype no soportado recibe 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype: 'application/pdf' })
        .expect(400);
    });
  });

  describe('PUT /v1/uploads/local-put/:token', () => {
    async function getToken(mimetype: string): Promise<{ token: string; publicUrl: string }> {
      const res = await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype })
        .expect(201);

      const token = res.body.presignedUrl.split('/').pop();
      return { token, publicUrl: res.body.publicUrl };
    }

    it('token válido + imagen JPEG → 204 y archivo guardado', async () => {
      const { token, publicUrl } = await getToken('image/jpeg');

      await request(app.getHttpServer())
        .put(`/v1/uploads/local-put/${token}`)
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(204);

      const expectedPath = path.join(process.cwd(), 'uploads', publicUrl.replace('/uploads/', ''));
      expect(fs.existsSync(expectedPath)).toBe(true);
      fs.unlinkSync(expectedPath);
    });

    it('token expirado recibe 401', async () => {
      const expiredToken = jwt.sign(
        { key: `restaurants/${restaurantId}/old.jpg`, publicUrl: '/uploads/restaurants/x/old.jpg' },
        process.env.JWT_SECRET!,
        { expiresIn: -1 },
      );

      await request(app.getHttpServer())
        .put(`/v1/uploads/local-put/${expiredToken}`)
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(401);
    });

    it('token inválido recibe 401', async () => {
      await request(app.getHttpServer())
        .put('/v1/uploads/local-put/not-a-valid-token')
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(401);
    });

    it('no requiere JWT de sesión (es público)', async () => {
      const { token } = await getToken('image/jpeg');

      await request(app.getHttpServer())
        .put(`/v1/uploads/local-put/${token}`)
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(204);
    });
  });
});
