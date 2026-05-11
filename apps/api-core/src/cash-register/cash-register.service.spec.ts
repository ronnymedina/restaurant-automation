/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { CashShiftStatus, OrderStatus, Prisma } from '@prisma/client';

import { CashRegisterService } from './cash-register.service';
import { CashShiftRepository } from './cash-register-session.repository';
import { OrderRepository } from '../orders/order.repository';
import {
  CashRegisterAlreadyOpenException,
  CashRegisterNotFoundException,
  NoOpenCashRegisterException,
  PendingOrdersException,
} from './exceptions/cash-register.exceptions';
import { DEFAULT_PAGE_SIZE } from '../config';
import { PrismaService } from '../prisma/prisma.service';

const mockSession = (overrides = {}) => ({
  id: 'session-uuid-1',
  restaurantId: 'restaurant-uuid-1',
  status: 'OPEN',
  openedAt: new Date(),
  closedAt: null,
  totalSales: null,
  totalOrders: null,
  closedBy: null,
  ...overrides,
});

const mockOrder = (overrides = {}) => ({
  id: 'order-uuid-1',
  totalAmount: 100,
  paymentMethod: 'CASH',
  status: 'COMPLETED',
  items: [],
  ...overrides,
});

const mockRegisterSessionRepository = {
  findOpen: jest.fn(),
  create: jest.fn(),
  close: jest.fn(),
  findByRestaurantIdPaginated: jest.fn(),
  findOpenWithOrderCount: jest.fn(),
  findById: jest.fn(),
};

const mockOrderRepository = {
  findBySessionId: jest.fn(),
};

// tx mock used inside $transaction callbacks for closeSession tests
const mockTx = {
  cashShift: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  order: {
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn(),
  },
};

const mockPrismaService: any = {
  $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  orderItem: {
    groupBy: jest.fn(),
  },
  product: {
    findMany: jest.fn(),
  },
  order: {
    groupBy: jest.fn(),
  },
};

describe('CashRegisterService', () => {
  let service: CashRegisterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashRegisterService,
        {
          provide: CashShiftRepository,
          useValue: mockRegisterSessionRepository,
        },
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CashRegisterService>(CashRegisterService);
    jest.clearAllMocks();
    // Re-wire $transaction after clearAllMocks resets it
    mockPrismaService.$transaction.mockImplementation(
      (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );
    // Default empty responses for groupBy/findMany used in getSessionSummary
    mockPrismaService.orderItem.groupBy.mockResolvedValue([]);
    mockPrismaService.product.findMany.mockResolvedValue([]);
    (mockPrismaService.order as any).groupBy.mockResolvedValue([]);
    // Default: no pending orders (allows closeSession to proceed)
    mockTx.order.count.mockResolvedValue(0);
  });

  describe('openSession', () => {
    it('should create and return a new session when no open session exists', async () => {
      const session = mockSession();
      mockRegisterSessionRepository.findOpen.mockResolvedValue(null);
      mockRegisterSessionRepository.create.mockResolvedValue(session);

      const result = await service.openSession('restaurant-uuid-1', 'user-uuid-1');

      expect(mockRegisterSessionRepository.findOpen).toHaveBeenCalledWith(
        'restaurant-uuid-1',
      );
      expect(mockRegisterSessionRepository.create).toHaveBeenCalledWith(
        'restaurant-uuid-1',
        'user-uuid-1',
      );
      expect(result).toEqual(session);
    });

    it('should throw CashRegisterAlreadyOpenException when a session is already open', async () => {
      mockRegisterSessionRepository.findOpen.mockResolvedValue(mockSession());

      await expect(service.openSession('restaurant-uuid-1', 'user-uuid-1')).rejects.toThrow(
        CashRegisterAlreadyOpenException,
      );

      expect(mockRegisterSessionRepository.create).not.toHaveBeenCalled();
    });

    it('should throw CashRegisterAlreadyOpenException when create rejects with P2002 (concurrent duplicate)', async () => {
      mockRegisterSessionRepository.findOpen.mockResolvedValue(null);
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7.0.0' });
      mockRegisterSessionRepository.create.mockRejectedValue(p2002Error);

      await expect(service.openSession('restaurant-uuid-1', 'user-uuid-1')).rejects.toThrow(
        CashRegisterAlreadyOpenException,
      );
    });

    it('should re-throw non-P2002 errors from create', async () => {
      const dbError = new Error('DB down');
      mockRegisterSessionRepository.findOpen.mockResolvedValue(null);
      mockRegisterSessionRepository.create.mockRejectedValue(dbError);

      await expect(service.openSession('restaurant-uuid-1', 'user-uuid-1')).rejects.toThrow(
        dbError,
      );
    });
  });

  describe('closeSession', () => {
    it('should throw NoOpenCashRegisterException when no open session exists', async () => {
      mockTx.cashShift.findFirst.mockResolvedValue(null);

      await expect(
        service.closeSession('restaurant-uuid-1'),
      ).rejects.toThrow(NoOpenCashRegisterException);

      expect(mockTx.cashShift.update).not.toHaveBeenCalled();
    });

    it('should throw PendingOrdersException when session has CREATED or PROCESSING orders', async () => {
      const session = mockSession();
      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.count.mockResolvedValue(2);

      await expect(
        service.closeSession('restaurant-uuid-1'),
      ).rejects.toThrow(PendingOrdersException);

      expect(mockTx.cashShift.update).not.toHaveBeenCalled();
    });

    it('should close the session and return session + summary with payment breakdown', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED, closedAt: new Date() });

      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 350n },
        _count: { id: 2 },
      });
      mockTx.order.groupBy.mockResolvedValue([
        { paymentMethod: 'CASH', _sum: { totalAmount: 150n }, _count: { id: 1 } },
        { paymentMethod: 'CARD', _sum: { totalAmount: 200n }, _count: { id: 1 } },
      ]);
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('restaurant-uuid-1');

      expect(mockTx.cashShift.findFirst).toHaveBeenCalledWith({
        where: { restaurantId: 'restaurant-uuid-1', status: CashShiftStatus.OPEN },
      });
      expect(mockTx.cashShift.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: expect.objectContaining({
          status: CashShiftStatus.CLOSED,
          totalOrders: 2,
        }),
      });
      expect(result.session).toEqual(closedSession);
      expect(result.summary.totalOrders).toBe(2);
      expect(result.summary.totalSales).toBe(3.5);
    });

    it('should calculate totalSales and totalOrders from aggregate', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 150n },
        _count: { id: 3 },
      });
      mockTx.order.groupBy.mockResolvedValue([]);
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('restaurant-uuid-1');

      expect(result.summary.totalSales).toBe(1.5);
      expect(result.summary.totalOrders).toBe(3);
    });

    it('should group orders by paymentMethod in paymentBreakdown', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 450n },
        _count: { id: 3 },
      });
      mockTx.order.groupBy.mockResolvedValue([
        { paymentMethod: 'CASH', _sum: { totalAmount: 300n }, _count: { id: 2 } },
        { paymentMethod: 'CARD', _sum: { totalAmount: 150n }, _count: { id: 1 } },
      ]);
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('restaurant-uuid-1');

      expect(result.summary.paymentBreakdown).toEqual({
        CASH: { count: 2, total: 3 },
        CARD: { count: 1, total: 1.5 },
      });
    });


    it('should use UNKNOWN as payment method when paymentMethod is null', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 100n },
        _count: { id: 1 },
      });
      mockTx.order.groupBy.mockResolvedValue([
        { paymentMethod: null, _sum: { totalAmount: 100n }, _count: { id: 1 } },
      ]);
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('restaurant-uuid-1');

      expect(result.summary.paymentBreakdown).toHaveProperty('UNKNOWN');
      expect(result.summary.paymentBreakdown['UNKNOWN']).toEqual({ count: 1, total: 1 });
      expect(result.summary.paymentBreakdown).not.toHaveProperty('null');
    });

    it('should pass closedBy to the tx.cashShift.update call', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED, closedBy: 'manager-uuid-1' });

      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 0n },
        _count: { id: 0 },
      });
      mockTx.order.groupBy.mockResolvedValue([]);
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      await service.closeSession('restaurant-uuid-1', 'manager-uuid-1');

      expect(mockTx.cashShift.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ closedBy: 'manager-uuid-1' }),
        }),
      );
    });

    it('should query only COMPLETED orders for aggregate and groupBy', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 200n },
        _count: { id: 2 },
      });
      mockTx.order.groupBy.mockResolvedValue([]);
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      await service.closeSession('restaurant-uuid-1');

      expect(mockTx.order.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(mockTx.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('should handle zero total when no orders exist', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockTx.cashShift.findFirst.mockResolvedValue(session);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: { id: 0 },
      });
      mockTx.order.groupBy.mockResolvedValue([]);
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('restaurant-uuid-1');

      expect(result.summary.totalSales).toBe(0);
      expect(result.summary.totalOrders).toBe(0);
      expect(result.summary.paymentBreakdown).toEqual({});
    });
  });

  describe('getSessionHistory', () => {
    it('should return paginated result with meta (total, page, limit, totalPages)', async () => {
      const sessions = [mockSession(), mockSession({ id: 'session-uuid-2' })];
      mockRegisterSessionRepository.findByRestaurantIdPaginated.mockResolvedValue({
        data: sessions,
        total: 2,
      });

      const result = await service.getSessionHistory('restaurant-uuid-1', 1, 10);

      expect(
        mockRegisterSessionRepository.findByRestaurantIdPaginated,
      ).toHaveBeenCalledWith('restaurant-uuid-1', 0, 10);
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should use defaults (page=1, limit=DEFAULT_PAGE_SIZE) when not provided', async () => {
      mockRegisterSessionRepository.findByRestaurantIdPaginated.mockResolvedValue({
        data: [],
        total: 0,
      });

      const result = await service.getSessionHistory('restaurant-uuid-1');

      expect(
        mockRegisterSessionRepository.findByRestaurantIdPaginated,
      ).toHaveBeenCalledWith('restaurant-uuid-1', 0, DEFAULT_PAGE_SIZE);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(DEFAULT_PAGE_SIZE);
    });

    it('should calculate totalPages correctly for multi-page results', async () => {
      mockRegisterSessionRepository.findByRestaurantIdPaginated.mockResolvedValue({
        data: [],
        total: 25,
      });

      const result = await service.getSessionHistory('restaurant-uuid-1', 1, 10);

      expect(result.meta.totalPages).toBe(3);
    });

    it('should calculate skip based on page and limit', async () => {
      mockRegisterSessionRepository.findByRestaurantIdPaginated.mockResolvedValue({
        data: [],
        total: 0,
      });

      await service.getSessionHistory('restaurant-uuid-1', 3, 5);

      expect(
        mockRegisterSessionRepository.findByRestaurantIdPaginated,
      ).toHaveBeenCalledWith('restaurant-uuid-1', 10, 5);
    });
  });

  describe('getCurrentSession', () => {
    it('should return session with order count when session exists', async () => {
      const sessionWithCount = {
        ...mockSession(),
        _count: { orders: 7 },
      };
      mockRegisterSessionRepository.findOpenWithOrderCount.mockResolvedValue(
        sessionWithCount,
      );

      const result = await service.getCurrentSession('restaurant-uuid-1');

      expect(
        mockRegisterSessionRepository.findOpenWithOrderCount,
      ).toHaveBeenCalledWith('restaurant-uuid-1');
      expect(result).toEqual(sessionWithCount);
    });

    it('should return empty object {} when no open session', async () => {
      mockRegisterSessionRepository.findOpenWithOrderCount.mockResolvedValue(null);

      const result = await service.getCurrentSession('restaurant-uuid-1');

      expect(result).toEqual({});
    });
  });

  describe('getSessionSummary', () => {
    it('should throw CashRegisterNotFoundException when session not found', async () => {
      mockRegisterSessionRepository.findById.mockResolvedValue(null);

      await expect(
        service.getSessionSummary('nonexistent-session-id'),
      ).rejects.toThrow(CashRegisterNotFoundException);

      expect(mockOrderRepository.findBySessionId).not.toHaveBeenCalled();
    });

    it('should return session, summary, and orders', async () => {
      const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      (mockPrismaService.order as any).groupBy.mockResolvedValue([
        { status: 'COMPLETED', _sum: { totalAmount: 200n }, _count: { id: 2 } },
        { status: 'CANCELLED', _sum: { totalAmount: 50n }, _count: { id: 1 } },
      ]);
      mockOrderRepository.findBySessionId.mockResolvedValue([]);

      const result = await service.getSessionSummary('session-uuid-1');

      expect(result.session).toEqual(session);
      expect(Array.isArray(result.orders)).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should build ordersByStatus with count and total for each status', async () => {
      const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      (mockPrismaService.order as any).groupBy.mockResolvedValue([
        { status: 'COMPLETED', _sum: { totalAmount: 200n }, _count: { id: 2 } },
        { status: 'CANCELLED', _sum: { totalAmount: 50n }, _count: { id: 1 } },
        { status: 'CREATED',   _sum: { totalAmount: 30n },  _count: { id: 1 } },
      ]);
      mockOrderRepository.findBySessionId.mockResolvedValue([]);

      const result = await service.getSessionSummary('session-uuid-1');

      expect(result.summary.ordersByStatus.COMPLETED).toEqual({ count: 2, total: 200n });
      expect(result.summary.ordersByStatus.CANCELLED).toEqual({ count: 1, total: 50n });
      expect(result.summary.ordersByStatus.CREATED).toEqual({ count: 1, total: 30n });
      expect(result.summary.ordersByStatus.PROCESSING).toEqual({ count: 0, total: 0n });
    });

    it('should compute totalSales as sum of CREATED + PROCESSING + COMPLETED (excludes CANCELLED)', async () => {
      const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      (mockPrismaService.order as any).groupBy.mockResolvedValue([
        { status: 'COMPLETED',  _sum: { totalAmount: 200n }, _count: { id: 2 } },
        { status: 'CANCELLED',  _sum: { totalAmount: 50n },  _count: { id: 1 } },
        { status: 'CREATED',    _sum: { totalAmount: 30n },  _count: { id: 1 } },
        { status: 'PROCESSING', _sum: { totalAmount: 10n },  _count: { id: 1 } },
      ]);
      mockOrderRepository.findBySessionId.mockResolvedValue([]);

      const result = await service.getSessionSummary('session-uuid-1');

      // 200 + 30 + 10 = 240 (centavos BigInt)
      expect(result.summary.totalSales).toBe(240n);
      expect(result.summary.totalOrders).toBe(5);
    });

    it('should compute paymentBreakdown from COMPLETED orders only via second groupBy', async () => {
      const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      (mockPrismaService.order as any).groupBy
        .mockResolvedValueOnce([
          { status: 'COMPLETED', _sum: { totalAmount: 200n }, _count: { id: 2 } },
        ])
        .mockResolvedValueOnce([
          { paymentMethod: 'CASH', _sum: { totalAmount: 150n }, _count: { id: 1 } },
          { paymentMethod: 'CARD', _sum: { totalAmount: 50n },  _count: { id: 1 } },
        ]);
      mockOrderRepository.findBySessionId.mockResolvedValue([]);

      const result = await service.getSessionSummary('session-uuid-1');

      expect(result.summary.paymentBreakdown).toEqual({
        CASH: { count: 1, total: 150n },
        CARD: { count: 1, total: 50n  },
      });

      const groupByCalls = (mockPrismaService.order as any).groupBy.mock.calls;
      // Find the paymentMethod groupBy call by its 'by' argument
      const paymentCall = groupByCalls.find(
        ([arg]: [any]) => Array.isArray(arg.by) && arg.by.includes('paymentMethod'),
      );
      expect(paymentCall?.[0]).toMatchObject({
        where: expect.objectContaining({ status: OrderStatus.COMPLETED }),
      });
    });

    it('should not include topProducts in summary', async () => {
      const session = mockSession({ status: 'CLOSED', totalOrders: null, totalSales: null });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      // groupBy already defaults to [] via beforeEach; no override needed
      mockOrderRepository.findBySessionId.mockResolvedValue([]);

      const result = await service.getSessionSummary('session-uuid-1');

      expect((result.summary as any).topProducts).toBeUndefined();
      expect((result.summary as any).completedOrders).toBeUndefined();
      expect((result.summary as any).cancelledOrders).toBeUndefined();
    });
  });

  describe('getTopProducts', () => {
    it('should throw CashRegisterNotFoundException when session not found', async () => {
      mockRegisterSessionRepository.findById.mockResolvedValue(null);

      await expect(
        service.getTopProducts('nonexistent-id'),
      ).rejects.toThrow(CashRegisterNotFoundException);
    });

    it('should return top 5 products sorted by quantity, excluding CANCELLED orders', async () => {
      const session = mockSession({ status: 'CLOSED' });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      mockPrismaService.orderItem.groupBy.mockResolvedValue([
        { productId: 'prod-1', _sum: { quantity: 10, subtotal: 1000n } },
        { productId: 'prod-2', _sum: { quantity: 5,  subtotal: 500n  } },
      ]);
      mockPrismaService.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Burger' },
        { id: 'prod-2', name: 'Fries'  },
      ]);

      const result = await service.getTopProducts('session-uuid-1');

      expect(result.topProducts).toHaveLength(2);
      expect(result.topProducts[0]).toEqual({ id: 'prod-1', name: 'Burger', quantity: 10, total: 1000n });
      expect(result.topProducts[1]).toEqual({ id: 'prod-2', name: 'Fries',  quantity: 5,  total: 500n  });
    });

    it('should call orderItem.groupBy with status { not: CANCELLED } filter', async () => {
      const session = mockSession({ status: 'CLOSED' });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      mockPrismaService.orderItem.groupBy.mockResolvedValue([]);
      mockPrismaService.product.findMany.mockResolvedValue([]);

      await service.getTopProducts('session-uuid-1');

      expect(mockPrismaService.orderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          where: expect.objectContaining({
            order: expect.objectContaining({
              cashShiftId: session.id,
              status: { not: OrderStatus.CANCELLED },
            }),
          }),
        }),
      );
    });

    it('should use fallback name "Producto" when product not found', async () => {
      const session = mockSession({ status: 'CLOSED' });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      mockPrismaService.orderItem.groupBy.mockResolvedValue([
        { productId: 'orphan-id', _sum: { quantity: 1, subtotal: 100n } },
      ]);
      mockPrismaService.product.findMany.mockResolvedValue([]);

      const result = await service.getTopProducts('session-uuid-1');

      expect(result.topProducts[0].name).toBe('Producto');
    });

    it('should return empty topProducts for a session with no orders', async () => {
      const session = mockSession({ status: 'CLOSED' });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      mockPrismaService.orderItem.groupBy.mockResolvedValue([]);
      mockPrismaService.product.findMany.mockResolvedValue([]);

      const result = await service.getTopProducts('session-uuid-1');

      expect(result.topProducts).toEqual([]);
    });
  });
});
