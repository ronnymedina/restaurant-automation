import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { KitchenTokenService } from './kitchen-token.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/order.repository';
import { SseService } from '../events/sse.service';
import { TimezoneService } from '../restaurants/timezone.service';

const mockRestaurantsService = {
  findById: jest.fn(),
  findByIdWithSettings: jest.fn(),
  upsertSettings: jest.fn(),
};
const mockOrdersService = {
  kitchenAdvanceStatus: jest.fn(),
};
const mockOrderRepository = {
  findActiveOrders: jest.fn(),
};
const mockSseService = {
  emitToRestaurant: jest.fn(),
};
const mockTimezoneService = {
  getTimezone: jest.fn().mockResolvedValue('UTC'),
};

const makeRestaurant = (overrides = {}) => ({
  id: 'r1',
  slug: 'test-restaurant',
  name: 'Test Restaurant',
  settings: {
    kitchenTokenHash: 'a'.repeat(64),
    kitchenTokenExpiresAt: new Date(Date.now() + 86400000),
  },
  ...overrides,
});

describe('KitchenService', () => {
  let service: KitchenService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KitchenService,
        KitchenTokenService,
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: SseService, useValue: mockSseService },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();
    service = module.get(KitchenService);
  });

  describe('getActiveOrders', () => {
    it('queries CONFIRMED and PROCESSING orders (not CREATED)', async () => {
      const orders = [
        { id: '1', status: OrderStatus.CONFIRMED, createdAt: new Date('2025-01-01T12:00:00Z'), items: [] },
        { id: '2', status: OrderStatus.PROCESSING, createdAt: new Date('2025-01-01T13:00:00Z'), items: [] },
      ];
      mockOrderRepository.findActiveOrders.mockResolvedValue(orders);
      const result = await service.getActiveOrders(makeRestaurant() as any);
      expect(result).toHaveLength(2);
      expect(mockOrderRepository.findActiveOrders).toHaveBeenCalledWith(
        'r1',
        [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      );
    });
  });

  describe('advanceStatus', () => {
    it('delegates to ordersService.kitchenAdvanceStatus', async () => {
      const updated = { id: 'o1', status: OrderStatus.PROCESSING, createdAt: new Date(), items: [] };
      mockOrdersService.kitchenAdvanceStatus.mockResolvedValue(updated);
      const result = await service.advanceStatus(makeRestaurant() as any, 'o1', OrderStatus.PROCESSING);
      expect(mockOrdersService.kitchenAdvanceStatus).toHaveBeenCalledWith('o1', 'r1', OrderStatus.PROCESSING);
      expect(result.status).toBe(OrderStatus.PROCESSING);
      expect(mockTimezoneService.getTimezone).toHaveBeenCalledWith('r1');
      expect(result).toHaveProperty('displayTime');
      expect(result.displayTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it('delegates PROCESSING → SERVED to kitchenAdvanceStatus', async () => {
      const served = { id: 'o1', status: OrderStatus.SERVED, createdAt: new Date(), items: [] };
      mockOrdersService.kitchenAdvanceStatus.mockResolvedValue(served);
      const result = await service.advanceStatus(makeRestaurant() as any, 'o1', OrderStatus.SERVED);
      expect(mockOrdersService.kitchenAdvanceStatus).toHaveBeenCalledWith('o1', 'r1', OrderStatus.SERVED);
      expect(result.status).toBe(OrderStatus.SERVED);
    });
  });

  describe('generateToken (H-14)', () => {
    it('persists tokenHash (not plain) to settings and returns plain token to caller', async () => {
      mockRestaurantsService.findById.mockResolvedValue(makeRestaurant());
      mockRestaurantsService.upsertSettings.mockResolvedValue({});
      const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString();

      const result = await service.generateToken('r1', futureDate);

      expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 43-char URL-safe base64
      expect(result.kitchenUrl).toContain(`/kitchen?slug=test-restaurant&token=${result.token}`);
      expect(result.expiresAt).toBeInstanceOf(Date);

      expect(mockRestaurantsService.upsertSettings).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          kitchenTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          kitchenTokenExpiresAt: expect.any(Date),
        }),
      );

      // upsert should NOT include kitchenToken (plain)
      const payload = mockRestaurantsService.upsertSettings.mock.calls[0][1];
      expect(payload).not.toHaveProperty('kitchenToken');
    });

    it('throws UnauthorizedException if restaurant not found', async () => {
      mockRestaurantsService.findById.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await expect(service.generateToken('bad-id', futureDate)).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException if expiresAt is in the past or today', async () => {
      mockRestaurantsService.findById.mockResolvedValue(makeRestaurant());
      const pastDate = new Date(Date.now() - 86_400_000).toISOString();
      await expect(service.generateToken('r1', pastDate)).rejects.toThrow();
    });
  });

  describe('getTokenInfo (H-14)', () => {
    it('returns hasToken=true without exposing plain when kitchenTokenHash is set and not expired', async () => {
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue({
        id: 'r1',
        slug: 'mi-rest',
        settings: {
          kitchenTokenHash: 'a'.repeat(64),
          kitchenTokenExpiresAt: new Date(Date.now() + 86_400_000),
        },
      });

      const result = await service.getTokenInfo('r1');
      expect(result).toEqual({
        hasToken: true,
        expiresAt: expect.any(Date),
      });
      expect(result).not.toHaveProperty('kitchenUrl');
    });

    it('returns hasToken=false when no hash exists', async () => {
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue({
        id: 'r1',
        slug: 'mi-rest',
        settings: { kitchenTokenHash: null },
      });

      const result = await service.getTokenInfo('r1');
      expect(result).toEqual({ hasToken: false, expiresAt: null });
    });

    it('returns hasToken=false when token is expired', async () => {
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue({
        id: 'r1',
        slug: 'mi-rest',
        settings: {
          kitchenTokenHash: 'a'.repeat(64),
          kitchenTokenExpiresAt: new Date(Date.now() - 1000),
        },
      });

      const result = await service.getTokenInfo('r1');
      expect(result).toEqual({ hasToken: false, expiresAt: null });
    });
  });

  describe('notifyOffline', () => {
    it('emits kitchen:offline to restaurant room', async () => {
      await service.notifyOffline(makeRestaurant() as any);
      expect(mockSseService.emitToRestaurant).toHaveBeenCalledWith(
        'r1',
        'kitchen:offline',
        {},
      );
    });
  });
});
