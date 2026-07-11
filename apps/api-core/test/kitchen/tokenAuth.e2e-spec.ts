import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { KitchenService } from '../../src/kitchen/kitchen.service';
import { bootstrapApp, seedRestaurantWithToken } from './kitchen.helpers';

jest.setTimeout(30_000);

describe('Kitchen token auth (H-14)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    prisma = boot.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts request with X-Kitchen-Token header', async () => {
    const { slug, token } = await seedRestaurantWithToken(prisma, 'header-ok');
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .set('X-Kitchen-Token', token)
      .expect(200);
  });

  it('rejects request with ?token= query (legacy removed in H-04)', async () => {
    const { slug, token } = await seedRestaurantWithToken(prisma, 'query-ok');
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .query({ token })
      .expect(401);
  });

  it('rejects request without any token', async () => {
    const { slug } = await seedRestaurantWithToken(prisma, 'no-token');
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .expect(401);
  });

  it('rejects request with wrong token', async () => {
    const { slug } = await seedRestaurantWithToken(prisma, 'wrong-token');
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .set('X-Kitchen-Token', 'definitely-wrong')
      .expect(401);
  });

  it('rejects oversize token (>128 chars) without hitting DB', async () => {
    const { slug } = await seedRestaurantWithToken(prisma, 'oversize');
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .set('X-Kitchen-Token', 'a'.repeat(2000))
      .expect(401);
  });

  it('regenerating token revokes the old one immediately', async () => {
    const { slug, restaurant, token: oldToken } = await seedRestaurantWithToken(prisma, 'regen');

    // Old token should work first
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .set('X-Kitchen-Token', oldToken)
      .expect(200);

    // Now regenerate via the service (simulating an admin clicking "Regenerate")
    const kitchenService = app.get(KitchenService);
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { token: newToken } = await kitchenService.generateToken(restaurant.id, expiresAt);

    // Old token rejected
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .set('X-Kitchen-Token', oldToken)
      .expect(401);

    // New token accepted
    await request(app.getHttpServer())
      .get(`/v1/kitchen/${slug}/orders`)
      .set('X-Kitchen-Token', newToken)
      .expect(200);
  });
});
