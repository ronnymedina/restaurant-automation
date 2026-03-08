import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrderRepository } from './order.repository';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService } from '../events/orders.events';
import { EmailService } from '../email/email.service';
import { PrintService } from '../print/print.service';
import {
  OrderNotFoundException,
  OrderAlreadyCancelledException,
  InvalidStatusTransitionException,
  OrderNotPaidException,
} from './exceptions/orders.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';

const mockOrderRepository = {
  findById: jest.fn(),
  createWithItems: jest.fn(),
  updateStatus: jest.fn(),
  cancelOrder: jest.fn(),
  markAsPaid: jest.fn(),
  findByRestaurantId: jest.fn(),
};
const mockPrisma: Record<string, any> = {
  $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrisma)),
  product: { findUnique: jest.fn(), update: jest.fn() },
  menuItem: { findUnique: jest.fn(), update: jest.fn() },
  registerSession: { update: jest.fn() },
};
const mockOrderEvents = {
  emitOrderCreated: jest.fn(),
  emitOrderUpdated: jest.fn(),
};
const mockEmail = { sendReceiptEmail: jest.fn() };
const mockPrint = { generateReceipt: jest.fn() };

const makeOrder = (overrides = {}) => ({
  id: 'o1',
  restaurantId: 'r1',
  status: OrderStatus.CREATED,
  isPaid: false,
  customerEmail: null,
  ...overrides,
});

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrderEventsService, useValue: mockOrderEvents },
        { provide: EmailService, useValue: mockEmail },
        { provide: PrintService, useValue: mockPrint },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('throws OrderNotFoundException when order not found', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);
      await expect(service.findById('bad', 'r1')).rejects.toThrow(OrderNotFoundException);
    });

    it('throws ForbiddenAccessException when restaurantId mismatches', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ restaurantId: 'other' }));
      await expect(service.findById('o1', 'r1')).rejects.toThrow(ForbiddenAccessException);
    });

    it('returns order when found and authorized', async () => {
      const order = makeOrder();
      mockOrderRepository.findById.mockResolvedValue(order);
      expect(await service.findById('o1', 'r1')).toEqual(order);
    });
  });

  describe('updateOrderStatus', () => {
    it('throws OrderAlreadyCancelledException for CANCELLED order', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.PROCESSING)).rejects.toThrow(OrderAlreadyCancelledException);
    });

    it('throws InvalidStatusTransitionException for backward transitions', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.CREATED)).rejects.toThrow(InvalidStatusTransitionException);
    });

    it('throws OrderNotPaidException when completing unpaid order', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING, isPaid: false }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.COMPLETED)).rejects.toThrow(OrderNotPaidException);
    });

    it('emits updated event on success', async () => {
      const updated = makeOrder({ status: OrderStatus.PROCESSING });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.updateStatus.mockResolvedValue(updated);
      await service.updateOrderStatus('o1', 'r1', OrderStatus.PROCESSING);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', updated);
    });
  });

  describe('cancelOrder', () => {
    it('throws OrderAlreadyCancelledException when already cancelled', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));
      await expect(service.cancelOrder('o1', 'r1', 'reason')).rejects.toThrow(OrderAlreadyCancelledException);
    });

    it('throws InvalidStatusTransitionException when COMPLETED', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.COMPLETED }));
      await expect(service.cancelOrder('o1', 'r1', 'reason')).rejects.toThrow(InvalidStatusTransitionException);
    });

    it('emits updated event on success', async () => {
      const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.cancelOrder.mockResolvedValue(cancelled);
      await service.cancelOrder('o1', 'r1', 'reason');
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', cancelled);
    });
  });

  describe('markAsPaid', () => {
    it('emits updated event and returns order', async () => {
      const paid = makeOrder({ isPaid: true });
      mockOrderRepository.findById.mockResolvedValue(makeOrder());
      mockOrderRepository.markAsPaid.mockResolvedValue(paid);
      const result = await service.markAsPaid('o1', 'r1');
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', paid);
      expect(result).toEqual(paid);
    });
  });
});
