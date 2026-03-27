import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/order.repository';
import { EventsGateway } from '../events/events.gateway';

const mockRestaurantsService = {
  findById: jest.fn(),
  findBySlug: jest.fn(),
  update: jest.fn(),
};
const mockOrdersService = {
  kitchenAdvanceStatus: jest.fn(),
  cancelOrder: jest.fn(),
};
const mockOrderRepository = {
  findByRestaurantId: jest.fn(),
};
const mockEventsGateway = {
  emitToRestaurant: jest.fn(),
};

const makeRestaurant = (overrides = {}) => ({
  id: 'r1',
  slug: 'test-restaurant',
  name: 'Test Restaurant',
  kitchenToken: 'token123',
  kitchenTokenExpiresAt: new Date(Date.now() + 86400000),
  ...overrides,
});

describe('KitchenService', () => {
  let service: KitchenService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KitchenService,
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: EventsGateway, useValue: mockEventsGateway },
      ],
    }).compile();
    service = module.get(KitchenService);
  });

  describe('getActiveOrders', () => {
    it('returns only CREATED and PROCESSING orders', async () => {
      const orders = [
        { id: '1', status: OrderStatus.CREATED },
        { id: '2', status: OrderStatus.PROCESSING },
      ];
      mockOrderRepository.findByRestaurantId.mockResolvedValue(orders);
      const result = await service.getActiveOrders(makeRestaurant() as any);
      expect(result).toHaveLength(2);
      expect(result.map((o) => o.status)).toEqual([OrderStatus.CREATED, OrderStatus.PROCESSING]);
      expect(mockOrderRepository.findByRestaurantId).toHaveBeenCalledWith(
        'r1',
        undefined,
        [OrderStatus.CREATED, OrderStatus.PROCESSING],
      );
    });
  });

  describe('advanceStatus', () => {
    it('delegates to ordersService.kitchenAdvanceStatus', async () => {
      const updated = { id: 'o1', status: OrderStatus.PROCESSING };
      mockOrdersService.kitchenAdvanceStatus.mockResolvedValue(updated);
      const result = await service.advanceStatus(makeRestaurant() as any, 'o1', OrderStatus.PROCESSING);
      expect(mockOrdersService.kitchenAdvanceStatus).toHaveBeenCalledWith('o1', 'r1', OrderStatus.PROCESSING);
      expect(result).toBe(updated);
    });
  });

  describe('cancelOrder', () => {
    it('delegates to ordersService.cancelOrder', async () => {
      const cancelled = { id: 'o1', status: OrderStatus.CANCELLED };
      mockOrdersService.cancelOrder.mockResolvedValue(cancelled);
      const result = await service.cancelOrder(makeRestaurant() as any, 'o1', 'No hay ingredientes');
      expect(mockOrdersService.cancelOrder).toHaveBeenCalledWith('o1', 'r1', 'No hay ingredientes');
      expect(result).toBe(cancelled);
    });
  });

  describe('generateToken', () => {
    it('generates a token and returns kitchenUrl', async () => {
      mockRestaurantsService.findById.mockResolvedValue(makeRestaurant());
      mockRestaurantsService.update.mockResolvedValue({});
      const result = await service.generateToken('r1');
      expect(result.token).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(result.kitchenUrl).toContain('/kitchen?slug=test-restaurant&token=');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws UnauthorizedException if restaurant not found', async () => {
      mockRestaurantsService.findById.mockResolvedValue(null);
      await expect(service.generateToken('bad-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('notifyOffline', () => {
    it('emits kitchen:offline to restaurant room', async () => {
      await service.notifyOffline(makeRestaurant() as any);
      expect(mockEventsGateway.emitToRestaurant).toHaveBeenCalledWith(
        'r1',
        'kitchen:offline',
        expect.objectContaining({ slug: 'test-restaurant' }),
      );
    });
  });
});
