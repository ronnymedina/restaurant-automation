import { Test, TestingModule } from '@nestjs/testing';
import { OrderEventsService, ORDER_EVENTS } from './orders.events';
import { EventsGateway } from './events.gateway';
import { Order } from '@prisma/client';

const mockGateway = {
  emitToRestaurant: jest.fn(),
  emitToKitchen: jest.fn(),
};

describe('OrderEventsService', () => {
  let service: OrderEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEventsService,
        { provide: EventsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<OrderEventsService>(OrderEventsService);
    jest.clearAllMocks();
  });

  const mockOrder = { id: 'o1', restaurantId: 'r1' } as Order;

  describe('emitOrderCreated', () => {
    it('emits order:new event to restaurant room', () => {
      service.emitOrderCreated('r1', mockOrder);
      expect(mockGateway.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, {
        order: mockOrder,
      });
    });

    it('emits order:new event to kitchen room', () => {
      service.emitOrderCreated('r1', mockOrder);
      expect(mockGateway.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, {
        order: mockOrder,
      });
    });
  });

  describe('emitOrderUpdated', () => {
    it('emits order:updated event to restaurant room', () => {
      service.emitOrderUpdated('r1', mockOrder);
      expect(mockGateway.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, {
        order: mockOrder,
      });
    });

    it('emits order:updated event to kitchen room', () => {
      service.emitOrderUpdated('r1', mockOrder);
      expect(mockGateway.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, {
        order: mockOrder,
      });
    });
  });
});
