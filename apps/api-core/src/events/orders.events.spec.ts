import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { OrderEventsService, ORDER_EVENTS } from './orders.events';
import { SseService } from './sse.service';
import type {
  OrderCreatedPayload, OrderUpdatedPayload, KitchenOrderPayload,
} from './payloads/order-event-payloads';

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
    service = module.get(OrderEventsService);
    jest.clearAllMocks();
  });

  const createdDashboard: OrderCreatedPayload = {
    id: 'o1', orderNumber: 7, status: OrderStatus.CREATED, isPaid: false, totalAmount: 100,
    paymentMethod: null, cancellationReason: null,
    customerEmail: null, customerPhone: null, deliveryAddress: null, deliveryReferences: null,
    orderSource: 'KIOSK', orderType: 'PICKUP', displayTime: '12:30', items: [],
  };
  const updatedDashboard: OrderUpdatedPayload = {
    id: 'o1', status: OrderStatus.CONFIRMED, isPaid: true,
    paymentMethod: PaymentMethod.CASH, cancellationReason: null,
  };
  const kitchen: KitchenOrderPayload = {
    id: 'o1', orderNumber: 7, status: OrderStatus.CONFIRMED, displayTime: '12:30', items: [],
  };

  describe('emitOrderCreated', () => {
    it('emits OrderCreatedPayload to the restaurant room', () => {
      service.emitOrderCreated('r1', createdDashboard, kitchen);
      expect(mockSseService.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, createdDashboard);
    });

    it('emits KitchenOrderPayload to the kitchen room', () => {
      service.emitOrderCreated('r1', createdDashboard, kitchen);
      expect(mockSseService.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.NEW, kitchen);
    });
  });

  describe('emitOrderUpdated', () => {
    it('emits OrderUpdatedPayload (delta) to the restaurant room', () => {
      service.emitOrderUpdated('r1', updatedDashboard, kitchen);
      expect(mockSseService.emitToRestaurant).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, updatedDashboard);
    });

    it('emits KitchenOrderPayload (full) to the kitchen room', () => {
      service.emitOrderUpdated('r1', updatedDashboard, kitchen);
      expect(mockSseService.emitToKitchen).toHaveBeenCalledWith('r1', ORDER_EVENTS.UPDATED, kitchen);
    });
  });
});
