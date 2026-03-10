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
  StockInsufficientException,
} from './exceptions/orders.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';
import { BadRequestException } from '@nestjs/common';

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
const mockPrint = {
  generateReceipt: jest.fn(),
  generateBoth: jest.fn().mockResolvedValue({ receipt: {}, kitchenTicket: {} }),
  printKitchenTicket: jest.fn().mockResolvedValue({ success: true, message: '' }),
};

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

    it('sends receipt email when customerEmail is set', async () => {
      const paid = makeOrder({ isPaid: true, customerEmail: 'customer@test.com' });
      mockOrderRepository.findById.mockResolvedValue(makeOrder());
      mockOrderRepository.markAsPaid.mockResolvedValue(paid);
      mockPrint.generateReceipt.mockResolvedValue('<html>receipt</html>');
      mockEmail.sendReceiptEmail.mockResolvedValue(undefined);

      await service.markAsPaid('o1', 'r1');

      expect(mockPrint.generateReceipt).toHaveBeenCalledWith('o1');
      expect(mockEmail.sendReceiptEmail).toHaveBeenCalledWith('customer@test.com', '<html>receipt</html>');
    });

    it('logs error but does not throw when receipt email fails', async () => {
      const paid = makeOrder({ isPaid: true, customerEmail: 'customer@test.com' });
      mockOrderRepository.findById.mockResolvedValue(makeOrder());
      mockOrderRepository.markAsPaid.mockResolvedValue(paid);
      mockPrint.generateReceipt.mockRejectedValue(new Error('Print failed'));

      await expect(service.markAsPaid('o1', 'r1')).resolves.toEqual(paid);
    });
  });

  describe('createOrder', () => {
    const baseDto = {
      items: [{ productId: 'p1', quantity: 2, notes: undefined, menuItemId: undefined }],
      paymentMethod: 'cash',
      customerEmail: undefined,
      expectedTotal: undefined,
    };

    beforeEach(() => {
      mockPrisma.registerSession.update.mockResolvedValue({ lastOrderNumber: 1 });
      mockOrderRepository.createWithItems.mockResolvedValue(makeOrder());
    });

    it('creates an order successfully with sufficient stock', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: 10,
        name: 'Widget',
      });
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      const result = await service.createOrder('r1', 'session1', baseDto as any);
      expect(mockOrderRepository.createWithItems).toHaveBeenCalled();
      expect(mockOrderEvents.emitOrderCreated).toHaveBeenCalledWith('r1', expect.anything());
      expect(result).toBeDefined();
    });

    it('creates order with null stock (infinite)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: null,
        name: 'Widget',
      });
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      await expect(service.createOrder('r1', 'session1', baseDto as any)).resolves.toBeDefined();
    });

    it('throws StockInsufficientException when product not found', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.createOrder('r1', 'session1', baseDto as any)).rejects.toThrow(
        StockInsufficientException,
      );
    });

    it('throws StockInsufficientException when product belongs to another restaurant', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'other',
        price: 5,
        stock: 10,
        name: 'Widget',
      });

      await expect(service.createOrder('r1', 'session1', baseDto as any)).rejects.toThrow(
        StockInsufficientException,
      );
    });

    it('throws StockInsufficientException when product stock is insufficient', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: 1,
        name: 'Widget',
      });
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      const dto = { ...baseDto, items: [{ productId: 'p1', quantity: 5 }] };
      await expect(service.createOrder('r1', 'session1', dto as any)).rejects.toThrow(
        StockInsufficientException,
      );
    });

    it('throws BadRequestException when expectedTotal does not match', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: null,
        name: 'Widget',
      });
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      const dto = { ...baseDto, items: [{ productId: 'p1', quantity: 2 }], expectedTotal: 99.99 };
      await expect(service.createOrder('r1', 'session1', dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('uses menuItem price when menuItemId is provided', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: null,
        name: 'Widget',
      });
      mockPrisma.menuItem.findUnique.mockResolvedValue({
        id: 'mi1',
        price: 8,
        stock: null,
      });

      const dto = { ...baseDto, items: [{ productId: 'p1', menuItemId: 'mi1', quantity: 1 }] };
      const result = await service.createOrder('r1', 'session1', dto as any);
      expect(mockOrderRepository.createWithItems).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 8 }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });

    it('throws StockInsufficientException when menuItem stock is insufficient', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: null,
        name: 'Widget',
      });
      mockPrisma.menuItem.findUnique.mockResolvedValue({
        id: 'mi1',
        price: 8,
        stock: 1,
      });

      const dto = { ...baseDto, items: [{ productId: 'p1', menuItemId: 'mi1', quantity: 5 }] };
      await expect(service.createOrder('r1', 'session1', dto as any)).rejects.toThrow(
        StockInsufficientException,
      );
    });

    it('decrements menuItem stock when both product and menuItem have finite stock', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: 10,
        name: 'Widget',
      });
      mockPrisma.menuItem.findUnique.mockResolvedValue({
        id: 'mi1',
        price: 8,
        stock: 10,
      });
      mockPrisma.product.update.mockResolvedValue({});
      mockPrisma.menuItem.update.mockResolvedValue({});

      const dto = { ...baseDto, items: [{ productId: 'p1', menuItemId: 'mi1', quantity: 2 }] };
      await service.createOrder('r1', 'session1', dto as any);

      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { decrement: 2 } },
      });
      expect(mockPrisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 'mi1' },
        data: { stock: { decrement: 2 } },
      });
    });
  });

  describe('findByRestaurantId', () => {
    it('returns orders filtered by restaurantId', async () => {
      const orders = [makeOrder()];
      mockOrderRepository.findByRestaurantId.mockResolvedValue(orders);
      const result = await service.findByRestaurantId('r1');
      expect(result).toEqual(orders);
    });

    it('passes status filter to repository', async () => {
      mockOrderRepository.findByRestaurantId.mockResolvedValue([]);
      await service.findByRestaurantId('r1', OrderStatus.CREATED);
      expect(mockOrderRepository.findByRestaurantId).toHaveBeenCalledWith('r1', OrderStatus.CREATED);
    });
  });

  describe('kitchenAdvanceStatus', () => {
    it('advances CREATED → PROCESSING without isPaid check', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.updateStatus.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));
      const result = await service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.PROCESSING);
      expect(result.status).toBe(OrderStatus.PROCESSING);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalled();
    });

    it('advances PROCESSING → COMPLETED without isPaid check', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING, isPaid: false }));
      mockOrderRepository.updateStatus.mockResolvedValue(makeOrder({ status: OrderStatus.COMPLETED }));
      const result = await service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.COMPLETED);
      expect(result.status).toBe(OrderStatus.COMPLETED);
    });

    it('throws on skip attempt (CREATED → COMPLETED)', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      await expect(service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.COMPLETED))
        .rejects.toThrow(InvalidStatusTransitionException);
    });

    it('throws if order is already cancelled', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));
      await expect(service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.PROCESSING))
        .rejects.toThrow(OrderAlreadyCancelledException);
    });
  });
});
