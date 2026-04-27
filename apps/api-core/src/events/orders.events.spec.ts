import { Test, TestingModule } from '@nestjs/testing';
import { OrderEventsService, ORDER_EVENTS } from './orders.events';
import { SseService } from './sse.service';
import { Order } from '@prisma/client';

const mockSseService = {
  emitToRestaurant: jest.fn(),
  emitToKitchen: jest.fn(),
};

describe('OrderEventsService', () => {
  let service: OrderEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEventsService,
        { provide: SseService, useValue: mockSseService },
      ],
    }).compile();

    service = module.get<OrderEventsService>(OrderEventsService);
    jest.clearAllMocks();
  });

  const mockOrder = { id: 'o1', restaurantId: 'r1' } as Order;

  describe('emitOrderCreated', () => {
    it('emits order:new event to restaurant room', () => {
      service.emitOrderCreated('r1', mockOrder);
      expect(mockSseService.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, {});
    });

    it('emits order:new event to kitchen room', () => {
      service.emitOrderCreated('r1', mockOrder);
      expect(mockSseService.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, {});
    });
  });

  describe('emitOrderUpdated', () => {
    it('emits order:updated event to restaurant room', () => {
      service.emitOrderUpdated('r1', mockOrder);
      expect(mockSseService.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, {});
    });

    it('emits order:updated event to kitchen room', () => {
      service.emitOrderUpdated('r1', mockOrder);
      expect(mockSseService.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, {});
    });
  });
});
