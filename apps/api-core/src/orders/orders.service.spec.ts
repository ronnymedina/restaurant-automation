import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, CashShiftStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrderRepository } from './order.repository';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService } from '../events/orders.events';
import { PrintService } from '../print/print.service';
import {
  OrderNotFoundException,
  OrderAlreadyCancelledException,
  InvalidStatusTransitionException,
  OrderNotPaidException,
  StockInsufficientException,
  RegisterNotOpenException,
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';
import { BadRequestException } from '@nestjs/common';
import { TimezoneService } from '../restaurants/timezone.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';

const mockOrderRepository = {
  findById: jest.fn(),
  createWithItems: jest.fn(),
  updateStatus: jest.fn(),
  cancelOrder: jest.fn(),
  listOrders: jest.fn(),
  findHistory: jest.fn(),
  transitionStatusIfMatches: jest.fn(),
  transitionStatusIfMatchesAndUnpaid: jest.fn(),
  unmarkAsPaidIfPaid: jest.fn(),
};
const mockCashShiftRepository = {
  findOpen: jest.fn(),
  lockShiftById: jest.fn(),
};
const mockPrisma: Record<string, any> = {
  $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrisma)),
  product: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  menuItem: { findUnique: jest.fn(), update: jest.fn() },
  cashShift: { update: jest.fn() },
};
const mockOrderEvents = {
  emitOrderCreated: jest.fn(),
  emitOrderUpdated: jest.fn(),
};
const mockPrint = {
  printKitchenTicket: jest.fn().mockResolvedValue({ success: true, message: '' }),
};
const mockTimezoneService = { getTimezone: jest.fn().mockResolvedValue('UTC') };

const makeOrder = (overrides = {}) => ({
  id: 'o1',
  restaurantId: 'r1',
  status: OrderStatus.CREATED,
  isPaid: false,
  customerEmail: null,
  orderNumber: 1,
  createdAt: new Date('2026-01-01T12:00:00Z'),
  items: [],
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
        { provide: PrintService, useValue: mockPrint },
        { provide: TimezoneService, useValue: mockTimezoneService },
        { provide: CashShiftRepository, useValue: mockCashShiftRepository },
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

    it('throws OrderNotFoundException when restaurantId mismatches (prevents cross-tenant enumeration)', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ restaurantId: 'other' }));
      await expect(service.findById('o1', 'r1')).rejects.toThrow(OrderNotFoundException);
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
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.SERVED, isPaid: false }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.COMPLETED))
        .rejects.toThrow(OrderNotPaidException);
    });

    it('emits updated event on success', async () => {
      const updated = makeOrder({ status: OrderStatus.CONFIRMED });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.updateStatus.mockResolvedValue(updated);
      await service.updateOrderStatus('o1', 'r1', OrderStatus.CONFIRMED);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: updated.id, status: updated.status, isPaid: updated.isPaid }),
        expect.objectContaining({ id: updated.id, orderNumber: updated.orderNumber }),
      );
    });

    it('throws InvalidStatusTransitionException when skipping CREATED → PROCESSING (strict +1 required)', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.PROCESSING))
        .rejects.toThrow(InvalidStatusTransitionException);
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
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: cancelled.id, status: cancelled.status, isPaid: cancelled.isPaid }),
        expect.objectContaining({ id: cancelled.id, orderNumber: cancelled.orderNumber }),
      );
    });

    it('throws CannotCancelPaidOrderException when order is paid', async () => {
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.CREATED, isPaid: true }),
      );
      await expect(service.cancelOrder('o1', 'r1', 'reason'))
        .rejects.toThrow(CannotCancelPaidOrderException);
    });

    it('throws CannotCancelPaidOrderException when CONFIRMED and paid', async () => {
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true }),
      );
      await expect(service.cancelOrder('o1', 'r1', 'reason'))
        .rejects.toThrow(CannotCancelPaidOrderException);
    });

    it('allows cancellation of CONFIRMED order when not paid', async () => {
      const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, isPaid: false }),
      );
      mockOrderRepository.cancelOrder.mockResolvedValue(cancelled);
      await expect(service.cancelOrder('o1', 'r1', 'reason')).resolves.toEqual(cancelled);
    });
  });

  describe('markAsPaid', () => {
    // Refactored markAsPaid (audit H-05) reads the order inside a tx via
    // tx.order.findFirst, so the default $transaction stub (cb => cb(mockPrisma))
    // does not expose `order.findFirst` properly. We override $transaction per
    // test, then restore the global default in afterEach so other describe
    // blocks (createOrder, etc.) keep their original tx semantics.
    const stubTxWithOrder = (txOrder: any) => {
      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb({
          order: { findFirst: jest.fn().mockResolvedValue(txOrder), update: jest.fn().mockResolvedValue(txOrder) },
        }),
      );
    };

    afterEach(() => {
      // Drain any unused mockImplementationOnce queued by stubTxWithOrder so
      // it can't leak into subsequent describe blocks. (clearAllMocks does
      // not flush the once-queue.)
      mockPrisma.$transaction.mockReset();
      mockPrisma.$transaction.mockImplementation((cb: (tx: any) => any) => cb(mockPrisma));
    });

    it('emits updated event and returns re-fetched order', async () => {
      const seed = makeOrder({ status: OrderStatus.CONFIRMED });
      const paid = makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true });
      stubTxWithOrder(seed);
      mockOrderRepository.transitionStatusIfMatchesAndUnpaid.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(paid);

      const result = await service.markAsPaid('o1', 'r1');
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: paid.id, status: paid.status, isPaid: paid.isPaid }),
        expect.objectContaining({ id: paid.id, orderNumber: paid.orderNumber }),
      );
      expect(result).toEqual(paid);
    });

    it('auto-confirms CREATED order when marking as paid', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.transitionStatusIfMatchesAndUnpaid.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true }),
      );

      await service.markAsPaid('o1', 'r1');
      // The transition primitive carries CREATED → CONFIRMED in one atomic UPDATE.
      expect(mockOrderRepository.transitionStatusIfMatchesAndUnpaid).toHaveBeenCalledWith(
        expect.anything(), 'o1', 'r1', OrderStatus.CREATED, OrderStatus.CONFIRMED, undefined,
      );
    });

    it('keeps the same status when already CONFIRMED', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CONFIRMED }));
      mockOrderRepository.transitionStatusIfMatchesAndUnpaid.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true }),
      );

      await service.markAsPaid('o1', 'r1');
      // No status change — expected and new are the same.
      expect(mockOrderRepository.transitionStatusIfMatchesAndUnpaid).toHaveBeenCalledWith(
        expect.anything(), 'o1', 'r1', OrderStatus.CONFIRMED, OrderStatus.CONFIRMED, undefined,
      );
    });

    it('keeps SERVED status when marking a SERVED order as paid (completion is a separate cashier action)', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.SERVED, isPaid: false }));
      mockOrderRepository.transitionStatusIfMatchesAndUnpaid.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.SERVED, isPaid: true }),
      );

      await service.markAsPaid('o1', 'r1');
      expect(mockOrderRepository.transitionStatusIfMatchesAndUnpaid).toHaveBeenCalledWith(
        expect.anything(), 'o1', 'r1', OrderStatus.SERVED, OrderStatus.SERVED, undefined,
      );
    });

    it('passes paymentMethod through to the transition helper when provided', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CONFIRMED }));
      mockOrderRepository.transitionStatusIfMatchesAndUnpaid.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true, paymentMethod: 'CASH' }),
      );

      await service.markAsPaid('o1', 'r1', 'CASH');
      expect(mockOrderRepository.transitionStatusIfMatchesAndUnpaid).toHaveBeenCalledWith(
        expect.anything(), 'o1', 'r1', OrderStatus.CONFIRMED, OrderStatus.CONFIRMED, 'CASH',
      );
    });

    it('passes undefined paymentMethod through to the transition helper when omitted', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CONFIRMED }));
      mockOrderRepository.transitionStatusIfMatchesAndUnpaid.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true }),
      );

      await service.markAsPaid('o1', 'r1');
      expect(mockOrderRepository.transitionStatusIfMatchesAndUnpaid).toHaveBeenCalledWith(
        expect.anything(), 'o1', 'r1', OrderStatus.CONFIRMED, OrderStatus.CONFIRMED, undefined,
      );
    });

    // --- New tests for audit H-05: idempotency + race detection -----------
    it('is idempotent when order is already paid — skips the transition', async () => {
      const paidOrder = makeOrder({ status: OrderStatus.COMPLETED, isPaid: true });
      stubTxWithOrder(paidOrder);
      // uses default mockOrderRepository.transitionStatusIfMatchesAndUnpaid (jest.fn() returns undefined)
      mockOrderRepository.findById.mockResolvedValue(paidOrder);

      const result = await service.markAsPaid('o1', 'r1', 'CASH');
      expect(mockOrderRepository.transitionStatusIfMatchesAndUnpaid).not.toHaveBeenCalled();
      expect(result).toEqual(paidOrder);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: paidOrder.id, status: paidOrder.status, isPaid: paidOrder.isPaid }),
        expect.objectContaining({ id: paidOrder.id, orderNumber: paidOrder.orderNumber }),
      );
    });

    it('throws InvalidStatusTransitionException when transitionStatusIfMatchesAndUnpaid returns 0 (race)', async () => {
      // Status read inside tx says CREATED, but by the time the optimistic
      // UPDATE runs another concurrent payment already flipped isPaid=true
      // (or the cashier cancelled the order). count=0 → reject the stale
      // operation rather than silently succeeding.
      stubTxWithOrder(makeOrder({ status: OrderStatus.CREATED, isPaid: false }));
      mockOrderRepository.transitionStatusIfMatchesAndUnpaid.mockResolvedValue(0);

      await expect(service.markAsPaid('o1', 'r1', 'CASH'))
        .rejects.toThrow(InvalidStatusTransitionException);
      expect(mockOrderEvents.emitOrderUpdated).not.toHaveBeenCalled();
    });

    it('throws OrderAlreadyCancelledException when order is CANCELLED', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CANCELLED, isPaid: false }));
      // uses default mockOrderRepository.transitionStatusIfMatchesAndUnpaid (jest.fn() returns undefined)

      await expect(service.markAsPaid('o1', 'r1', 'CASH'))
        .rejects.toThrow(OrderAlreadyCancelledException);
      expect(mockOrderRepository.transitionStatusIfMatchesAndUnpaid).not.toHaveBeenCalled();
    });

    it('throws OrderNotFoundException when order does not exist', async () => {
      stubTxWithOrder(null);
      await expect(service.markAsPaid('missing', 'r1', 'CASH'))
        .rejects.toThrow(OrderNotFoundException);
    });
  });

  describe('confirmOrder', () => {
    it('throws InvalidStatusTransitionException when not in CREATED', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));
      await expect(service.confirmOrder('o1', 'r1'))
        .rejects.toThrow(InvalidStatusTransitionException);
    });

    it('throws InvalidStatusTransitionException when PROCESSING', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));
      await expect(service.confirmOrder('o1', 'r1'))
        .rejects.toThrow(InvalidStatusTransitionException);
    });

    it('updates status to CONFIRMED and emits event', async () => {
      const confirmed = makeOrder({ status: OrderStatus.CONFIRMED });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.updateStatus.mockResolvedValue(confirmed);
      const result = await service.confirmOrder('o1', 'r1');
      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith('o1', OrderStatus.CONFIRMED);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: confirmed.id, status: confirmed.status, isPaid: confirmed.isPaid }),
        expect.objectContaining({ id: confirmed.id, orderNumber: confirmed.orderNumber }),
      );
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });
  });

  describe('unmarkAsPaid', () => {
    // Refactored unmarkAsPaid (audit H-06) reads the order inside a tx via
    // tx.order.findFirst, so the default $transaction stub (cb => cb(mockPrisma))
    // does not expose `order.findFirst` properly. We override $transaction per
    // test, then restore the global default in afterEach so other describe
    // blocks keep their original tx semantics.
    const stubTxWithOrder = (txOrder: any) => {
      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb({
          order: { findFirst: jest.fn().mockResolvedValue(txOrder) },
        }),
      );
    };

    afterEach(() => {
      // Drain any unused mockImplementationOnce queued by stubTxWithOrder so
      // it can't leak into subsequent describe blocks. (clearAllMocks does
      // not flush the once-queue.)
      mockPrisma.$transaction.mockReset();
      mockPrisma.$transaction.mockImplementation((cb: (tx: any) => any) => cb(mockPrisma));
    });

    it('clears isPaid, emits updated event and returns re-fetched order', async () => {
      const seed = makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true });
      const unpaid = makeOrder({ status: OrderStatus.CONFIRMED, isPaid: false });
      stubTxWithOrder(seed);
      mockOrderRepository.unmarkAsPaidIfPaid.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(unpaid);

      const result = await service.unmarkAsPaid('o1', 'r1');
      expect(mockOrderRepository.unmarkAsPaidIfPaid).toHaveBeenCalledWith(
        expect.anything(), 'o1', 'r1',
      );
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: unpaid.id, status: unpaid.status, isPaid: unpaid.isPaid }),
        expect.objectContaining({ id: unpaid.id, orderNumber: unpaid.orderNumber }),
      );
      expect(result).toEqual(unpaid);
    });

    it('rejects COMPLETED orders', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.COMPLETED, isPaid: true }));

      await expect(service.unmarkAsPaid('o1', 'r1'))
        .rejects.toThrow(InvalidStatusTransitionException);
      expect(mockOrderRepository.unmarkAsPaidIfPaid).not.toHaveBeenCalled();
      expect(mockOrderEvents.emitOrderUpdated).not.toHaveBeenCalled();
    });

    it('is idempotent when order is not paid — skips the helper', async () => {
      const unpaidSeed = makeOrder({ status: OrderStatus.CONFIRMED, isPaid: false });
      stubTxWithOrder(unpaidSeed);
      mockOrderRepository.findById.mockResolvedValue(unpaidSeed);

      const result = await service.unmarkAsPaid('o1', 'r1');
      expect(mockOrderRepository.unmarkAsPaidIfPaid).not.toHaveBeenCalled();
      expect(result).toEqual(unpaidSeed);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: unpaidSeed.id, status: unpaidSeed.status, isPaid: unpaidSeed.isPaid }),
        expect.objectContaining({ id: unpaidSeed.id, orderNumber: unpaidSeed.orderNumber }),
      );
    });

    it('throws InvalidStatusTransitionException when unmarkAsPaidIfPaid returns 0 (race)', async () => {
      // Status read inside tx says CONFIRMED+isPaid=true, but by the time the
      // optimistic UPDATE runs another concurrent transaction already flipped
      // isPaid=false. count=0 → reject the stale operation rather than
      // silently succeeding.
      stubTxWithOrder(makeOrder({ status: OrderStatus.CONFIRMED, isPaid: true }));
      mockOrderRepository.unmarkAsPaidIfPaid.mockResolvedValue(0);

      await expect(service.unmarkAsPaid('o1', 'r1'))
        .rejects.toThrow(InvalidStatusTransitionException);
      expect(mockOrderEvents.emitOrderUpdated).not.toHaveBeenCalled();
    });

    it('throws OrderNotFoundException when order does not exist', async () => {
      stubTxWithOrder(null);
      await expect(service.unmarkAsPaid('missing', 'r1'))
        .rejects.toThrow(OrderNotFoundException);
      expect(mockOrderRepository.unmarkAsPaidIfPaid).not.toHaveBeenCalled();
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
      mockPrisma.cashShift.update.mockResolvedValue({ lastOrderNumber: 1 });
      mockOrderRepository.createWithItems.mockResolvedValue(makeOrder());
      mockCashShiftRepository.lockShiftById.mockResolvedValue(CashShiftStatus.OPEN);
    });

    it('creates an order successfully with sufficient stock', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: 10,
        name: 'Widget',
      });
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.createOrder('r1', 'session1', baseDto as any);
      expect(mockOrderRepository.createWithItems).toHaveBeenCalled();
      expect(mockOrderEvents.emitOrderCreated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: expect.any(String), items: expect.any(Array) }),
        expect.objectContaining({ id: expect.any(String), items: expect.any(Array) }),
      );
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

    it('uses product price when menuItemId is provided (no menuItem price override)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: null,
        name: 'Widget',
      });

      const dto = { ...baseDto, items: [{ productId: 'p1', menuItemId: 'mi1', quantity: 1 }] };
      const result = await service.createOrder('r1', 'session1', dto as any);
      expect(mockOrderRepository.createWithItems).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 5 }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });

    it('throws StockInsufficientException when updateMany returns count 0 (concurrent stock depletion)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: 10,
        name: 'Widget',
      });
      // Simulate concurrent depletion: the atomic WHERE stock >= quantity fails
      mockPrisma.product.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.createOrder('r1', 'session1', baseDto as any)).rejects.toThrow(
        StockInsufficientException,
      );
    });

    it('decrements product stock atomically using updateMany with conditional WHERE', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        restaurantId: 'r1',
        price: 5,
        stock: 10,
        name: 'Widget',
      });
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });

      const dto = { ...baseDto, items: [{ productId: 'p1', quantity: 2 }] };
      await service.createOrder('r1', 'session1', dto as any);

      expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
    });

    it('passes customerPhone, deliveryAddress and deliveryReferences to repository', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1', restaurantId: 'r1', price: 5, stock: 10, name: 'Widget',
      });
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });

      const dto = {
        ...baseDto,
        orderType: 'DELIVERY',
        customerPhone: '555-1234',
        deliveryAddress: 'Calle Reforma 123',
        deliveryReferences: 'Puerta azul',
      };

      await service.createOrder('r1', 'session1', dto as any);

      expect(mockOrderRepository.createWithItems).toHaveBeenCalledWith(
        expect.objectContaining({
          customerPhone: '555-1234',
          deliveryAddress: 'Calle Reforma 123',
          deliveryReferences: 'Puerta azul',
        }),
        expect.anything(),
      );
    });

    it('increments the order counter inside the main transaction (after lock acquisition)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1', restaurantId: 'r1', price: 5, stock: null, name: 'Widget',
      });

      await service.createOrder('r1', 'session1', baseDto as any);

      // The counter increment now happens inside the tx, AFTER lockShiftById.
      // This fixes the H-09 write-skew race with closeSession.
      expect(mockCashShiftRepository.lockShiftById).toHaveBeenCalledWith(
        expect.anything(), 'session1',
      );
      expect(mockPrisma.cashShift.update).toHaveBeenCalledWith({
        where: { id: 'session1' },
        data: { lastOrderNumber: { increment: 1 } },
        select: { lastOrderNumber: true },
      });
      // Lock must be acquired before the counter increment runs.
      expect(mockCashShiftRepository.lockShiftById.mock.invocationCallOrder[0])
        .toBeLessThan(mockPrisma.cashShift.update.mock.invocationCallOrder[0]);
    });

    it('does NOT increment the counter when lockShiftById returns null (transaction rolls back before update)', async () => {
      mockCashShiftRepository.lockShiftById.mockResolvedValue(null);

      await expect(service.createOrder('r1', 'session1', baseDto as any)).rejects.toThrow(
        RegisterNotOpenException,
      );

      expect(mockPrisma.cashShift.update).not.toHaveBeenCalled();
    });
  });

  describe('createOrder lock (H-09)', () => {
    const baseDto = {
      items: [],
      paymentMethod: 'cash',
      customerEmail: undefined,
      expectedTotal: undefined,
    };

    it('throws RegisterNotOpenException when lockShiftById returns null', async () => {
      mockCashShiftRepository.lockShiftById.mockResolvedValue(null);

      await expect(
        service.createOrder('r1', 's1', baseDto as any),
      ).rejects.toThrow(RegisterNotOpenException);

      // The increment must NOT happen when the lock check fails.
      expect(mockPrisma.cashShift.update).not.toHaveBeenCalled();
      expect(mockOrderRepository.createWithItems).not.toHaveBeenCalled();
    });

    it('throws RegisterNotOpenException when locked shift status is CLOSED', async () => {
      mockCashShiftRepository.lockShiftById.mockResolvedValue(CashShiftStatus.CLOSED);

      await expect(
        service.createOrder('r1', 's1', baseDto as any),
      ).rejects.toThrow(RegisterNotOpenException);

      expect(mockPrisma.cashShift.update).not.toHaveBeenCalled();
      expect(mockOrderRepository.createWithItems).not.toHaveBeenCalled();
    });

    it('continues to increment lastOrderNumber when status is OPEN', async () => {
      mockCashShiftRepository.lockShiftById.mockResolvedValue(CashShiftStatus.OPEN);
      mockPrisma.cashShift.update.mockResolvedValue({ lastOrderNumber: 1 });
      mockOrderRepository.createWithItems.mockResolvedValue(makeOrder());

      await service.createOrder('r1', 's1', baseDto as any);

      expect(mockPrisma.cashShift.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { lastOrderNumber: { increment: 1 } },
        select: { lastOrderNumber: true },
      });
    });
  });

  describe('listOrders', () => {
    it('throws RegisterNotOpenException when no shift is open', async () => {
      mockCashShiftRepository.findOpen.mockResolvedValue(null);
      await expect(service.listOrders('r1')).rejects.toThrow(RegisterNotOpenException);
    });

    it('calls orderRepository with the open shift id', async () => {
      const shift = { id: 'shift-1' };
      mockCashShiftRepository.findOpen.mockResolvedValue(shift);
      mockOrderRepository.listOrders.mockResolvedValue([]);
      await service.listOrders('r1');
      expect(mockOrderRepository.listOrders).toHaveBeenCalledWith(
        'r1', 'shift-1', undefined, undefined, undefined,
      );
    });

    it('passes statuses and limit to repository', async () => {
      const shift = { id: 'shift-1' };
      mockCashShiftRepository.findOpen.mockResolvedValue(shift);
      mockOrderRepository.listOrders.mockResolvedValue([]);
      await service.listOrders('r1', [OrderStatus.CREATED], 15);
      expect(mockOrderRepository.listOrders).toHaveBeenCalledWith(
        'r1', 'shift-1', [OrderStatus.CREATED], 15, undefined,
      );
    });

    it('passes multiple statuses to repository', async () => {
      const shift = { id: 'shift-1' };
      mockCashShiftRepository.findOpen.mockResolvedValue(shift);
      mockOrderRepository.listOrders.mockResolvedValue([]);
      await service.listOrders('r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100);
      expect(mockOrderRepository.listOrders).toHaveBeenCalledWith(
        'r1', 'shift-1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined,
      );
    });
  });

  describe('kitchenAdvanceStatus', () => {
    // Helper: wires the $transaction mock so that tx.order.findFirst returns
    // the supplied order. The default $transaction mock (cb => cb(mockPrisma))
    // is not used here because the refactored kitchenAdvanceStatus needs a tx
    // client with an `order.findFirst` method (audit H-13).
    const stubTxWithOrder = (txOrder: any) => {
      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb({
          order: { findFirst: jest.fn().mockResolvedValue(txOrder) },
        }),
      );
    };

    it('advances CONFIRMED → PROCESSING without isPaid check', async () => {
      const seed = makeOrder({ status: OrderStatus.CONFIRMED });
      stubTxWithOrder(seed);
      mockOrderRepository.transitionStatusIfMatches.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));
      const result = await service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.PROCESSING);
      expect(result.status).toBe(OrderStatus.PROCESSING);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: result.id, status: result.status, isPaid: result.isPaid }),
        expect.objectContaining({ id: result.id, orderNumber: result.orderNumber }),
      );
    });

    it('throws InvalidStatusTransitionException when CREATED → PROCESSING (must confirm first)', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CREATED }));
      await expect(service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.PROCESSING))
        .rejects.toThrow(InvalidStatusTransitionException);
    });

    it('advances PROCESSING → SERVED without isPaid check', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.PROCESSING, isPaid: false }));
      mockOrderRepository.transitionStatusIfMatches.mockResolvedValue(1);
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.SERVED }));
      const result = await service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.SERVED);
      expect(result.status).toBe(OrderStatus.SERVED);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: result.id, status: result.status, isPaid: result.isPaid }),
        expect.objectContaining({ id: result.id, orderNumber: result.orderNumber }),
      );
    });

    it('throws on skip attempt (CREATED → COMPLETED)', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CREATED }));
      await expect(service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.COMPLETED))
        .rejects.toThrow(InvalidStatusTransitionException);
    });

    it('throws if order is already cancelled', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.CANCELLED }));
      await expect(service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.PROCESSING))
        .rejects.toThrow(OrderAlreadyCancelledException);
    });

    it('throws InvalidStatusTransitionException when SERVED → COMPLETED via kitchen (cap exceeded)', async () => {
      stubTxWithOrder(makeOrder({ status: OrderStatus.SERVED, isPaid: false }));
      await expect(service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.COMPLETED))
        .rejects.toThrow(InvalidStatusTransitionException);
    });

    describe('race detection (H-13)', () => {
      it('throws InvalidStatusTransitionException when updateMany count=0 (status drifted)', async () => {
        // The status read in tx says PROCESSING (a perfectly valid +1
        // transition target SERVED), but by the time the optimistic UPDATE
        // runs, another transaction has already advanced (or cancelled)
        // the row. transitionStatusIfMatches returns 0 and the service
        // must reject the now-stale advance instead of silently no-op'ing.
        stubTxWithOrder(makeOrder({ status: OrderStatus.PROCESSING }));
        mockOrderRepository.transitionStatusIfMatches.mockResolvedValue(0);

        await expect(
          service.kitchenAdvanceStatus('o1', 'r1', OrderStatus.SERVED),
        ).rejects.toThrow(InvalidStatusTransitionException);

        expect(mockOrderEvents.emitOrderUpdated).not.toHaveBeenCalled();
      });
    });
  });

  describe('createStaffOrder', () => {
    it('throws RegisterNotOpenException when no open shift', async () => {
      mockCashShiftRepository.findOpen.mockResolvedValue(null);
      const dto = { items: [], paymentMethod: undefined } as any;
      await expect(service.createStaffOrder('r1', dto)).rejects.toThrow(RegisterNotOpenException);
    });

    it('calls createOrder with orderSource STAFF when shift is open', async () => {
      mockCashShiftRepository.findOpen.mockResolvedValue({ id: 'shift1' });
      mockCashShiftRepository.lockShiftById.mockResolvedValue(CashShiftStatus.OPEN);
      mockPrisma.cashShift.update.mockResolvedValue({ lastOrderNumber: 1 });
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p1', restaurantId: 'r1', price: BigInt(1000), stock: 10, name: 'Pizza',
      });
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      const createdOrder = { id: 'o1', orderNumber: 1, orderSource: 'STAFF', status: 'CONFIRMED', items: [], createdAt: new Date('2026-01-01T12:00:00Z') };
      mockOrderRepository.createWithItems.mockResolvedValue(createdOrder);

      const dto = {
        items: [{ productId: 'p1', quantity: 1 }],
        orderType: 'PICKUP',
      } as any;

      const result = await service.createStaffOrder('r1', dto);
      expect(result.order.orderSource).toBe('STAFF');
      expect(result.order.status).toBe('CONFIRMED');
    });
  });

  describe('findHistory', () => {
    beforeEach(() => {
      mockOrderRepository.findHistory.mockResolvedValue({ data: [], total: 0 });
    });

    it('always calls getTimezone with the restaurantId', async () => {
      mockTimezoneService.getTimezone.mockResolvedValue('UTC');
      await service.findHistory('r1', { page: 1, limit: 10 });
      expect(mockTimezoneService.getTimezone).toHaveBeenCalledWith('r1');
    });

    it('passes undefined dateFrom and dateTo when no dates provided', async () => {
      mockTimezoneService.getTimezone.mockResolvedValue('UTC');
      await service.findHistory('r1', { page: 1, limit: 10 });
      expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
      );
    });

    it('converts dateFrom to UTC start-of-day boundary for the restaurant timezone', async () => {
      mockTimezoneService.getTimezone.mockResolvedValue('America/Mexico_City');
      await service.findHistory('r1', { dateFrom: '2026-01-15', page: 1, limit: 10 });
      // Mexico City is UTC-6 in January; midnight local = 06:00 UTC
      expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ dateFrom: new Date('2026-01-15T06:00:00.000Z') }),
      );
    });

    it('converts dateTo to UTC end-of-day boundary for the restaurant timezone', async () => {
      mockTimezoneService.getTimezone.mockResolvedValue('America/Mexico_City');
      await service.findHistory('r1', { dateTo: '2026-01-15', page: 1, limit: 10 });
      // End of Jan 15 in Mexico City = 2026-01-16T05:59:59.999Z UTC
      expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ dateTo: new Date('2026-01-16T05:59:59.999Z') }),
      );
    });

    it('forwards page and limit to the repository', async () => {
      mockTimezoneService.getTimezone.mockResolvedValue('UTC');
      await service.findHistory('r1', { page: 3, limit: 5 });
      expect(mockOrderRepository.findHistory).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ page: 3, limit: 5 }),
      );
    });
  });
});
