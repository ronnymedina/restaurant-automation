/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { CashShiftStatus, Prisma } from '@prisma/client';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterStatsService } from './cash-register-stats.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
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
  findByRestaurantIdPaginated: jest.fn(),
  findOpenWithOrderCount: jest.fn(),
  findOpenId: jest.fn(),
  findById: jest.fn(),
  lockOpenShift: jest.fn(),
};

// tx mock used inside $transaction callbacks for closeSession tests
const mockTx = {
  cashShift: {
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

const mockStatsResult = {
  counts: { total: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0, pending: 0 },
  revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
  byPaymentMethod: [],
  byOrderType: [],
  byOrderSource: [],
  topProducts: [],
};

const mockStatsService = {
  getSummary: jest.fn().mockResolvedValue(mockStatsResult),
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
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CashRegisterStatsService, useValue: mockStatsService },
      ],
    }).compile();

    service = module.get<CashRegisterService>(CashRegisterService);
    jest.clearAllMocks();
    // Re-wire $transaction after clearAllMocks resets it
    mockPrismaService.$transaction.mockImplementation(
      (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );
    // Default empty responses for groupBy/findMany used by CashRegisterStatsService
    mockPrismaService.orderItem.groupBy.mockResolvedValue([]);
    mockPrismaService.product.findMany.mockResolvedValue([]);
    (mockPrismaService.order as any).groupBy.mockResolvedValue([]);
    // Default: no pending orders (allows closeSession to proceed)
    mockTx.order.count.mockResolvedValue(0);
    // Default stats service response
    mockStatsService.getSummary.mockResolvedValue(mockStatsResult);
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
      mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(null);

      await expect(
        service.closeSession('restaurant-uuid-1', 'user-uuid-1'),
      ).rejects.toThrow(NoOpenCashRegisterException);

      expect(mockTx.cashShift.update).not.toHaveBeenCalled();
    });

    it('should throw PendingOrdersException when session has CREATED, CONFIRMED, PROCESSING, or SERVED orders', async () => {
      const session = mockSession();
      mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(session.id);
      mockTx.order.count.mockResolvedValue(2);

      await expect(
        service.closeSession('restaurant-uuid-1', 'user-uuid-1'),
      ).rejects.toThrow(PendingOrdersException);

      expect(mockTx.cashShift.update).not.toHaveBeenCalled();
    });

    it('should close the session and return session + summary', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED, closedAt: new Date() });

      mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(session.id);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 350n },
        _count: { id: 2 },
      });
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('restaurant-uuid-1', 'user-uuid-1');

      expect(mockRegisterSessionRepository.lockOpenShift).toHaveBeenCalledWith(
        mockTx,
        'restaurant-uuid-1',
      );
      expect(mockTx.cashShift.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: expect.objectContaining({
          status: CashShiftStatus.CLOSED,
          totalOrders: 2,
        }),
      });
      expect(result.session).toEqual(closedSession);
      expect(result.summary).toEqual(mockStatsResult);
    });

    it('should call statsService.getSummary with closedSession.id and restaurantId', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(session.id);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 150n },
        _count: { id: 3 },
      });
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      await service.closeSession('restaurant-uuid-1', 'user-uuid-1');

      expect(mockStatsService.getSummary).toHaveBeenCalledWith('restaurant-uuid-1', closedSession.id);
    });

    it('should pass closedBy to the tx.cashShift.update call', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED, closedBy: 'manager-uuid-1' });

      mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(session.id);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 0n },
        _count: { id: 0 },
      });
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      await service.closeSession('restaurant-uuid-1', 'manager-uuid-1');

      expect(mockTx.cashShift.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ closedBy: 'manager-uuid-1' }),
        }),
      );
    });

    it('should query only COMPLETED orders for aggregate', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(session.id);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 200n },
        _count: { id: 2 },
      });
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      await service.closeSession('restaurant-uuid-1', 'user-uuid-1');

      expect(mockTx.order.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('should handle zero total when no orders exist', async () => {
      const session = mockSession();
      const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

      mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(session.id);
      mockTx.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: { id: 0 },
      });
      mockTx.cashShift.update.mockResolvedValue(closedSession);

      const result = await service.closeSession('restaurant-uuid-1', 'user-uuid-1');

      expect(result.session).toEqual(closedSession);
      expect(result.summary).toEqual(mockStatsResult);
      expect(mockTx.cashShift.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalOrders: 0, totalSales: 0n }),
        }),
      );
    });

    describe('closeSession lock', () => {
      it('calls lockOpenShift inside the transaction before counting pending orders', async () => {
        const session = mockSession();
        const closedSession = mockSession({ status: CashShiftStatus.CLOSED });

        mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(session.id);
        mockTx.order.aggregate.mockResolvedValue({
          _sum: { totalAmount: 0n },
          _count: { id: 0 },
        });
        mockTx.cashShift.update.mockResolvedValue(closedSession);

        await service.closeSession('restaurant-uuid-1', 'user-uuid-1');

        expect(mockRegisterSessionRepository.lockOpenShift).toHaveBeenCalledWith(
          mockTx,
          'restaurant-uuid-1',
        );

        // lockOpenShift must be called before tx.order.count (pending check)
        const lockOrder =
          mockRegisterSessionRepository.lockOpenShift.mock.invocationCallOrder[0];
        const countOrder = mockTx.order.count.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(countOrder);
      });

      it('throws NoOpenCashRegisterException when lockOpenShift returns null', async () => {
        mockRegisterSessionRepository.lockOpenShift.mockResolvedValue(null);

        await expect(
          service.closeSession('restaurant-uuid-1', 'user-uuid-1'),
        ).rejects.toThrow(NoOpenCashRegisterException);

        expect(mockTx.order.count).not.toHaveBeenCalled();
        expect(mockTx.cashShift.update).not.toHaveBeenCalled();
      });
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

  describe('getOpenSessionId', () => {
    it('should return the session id when an open session exists', async () => {
      mockRegisterSessionRepository.findOpenId.mockResolvedValue('session-uuid-1');

      const result = await service.getOpenSessionId('restaurant-uuid-1');

      expect(mockRegisterSessionRepository.findOpenId).toHaveBeenCalledWith('restaurant-uuid-1');
      expect(result).toBe('session-uuid-1');
    });

    it('should return null when no open session exists', async () => {
      mockRegisterSessionRepository.findOpenId.mockResolvedValue(null);

      const result = await service.getOpenSessionId('restaurant-uuid-1');

      expect(result).toBeNull();
    });
  });

  describe('getSessionSummary', () => {
    it('should return session and summary via statsService', async () => {
      const session = mockSession({ status: 'CLOSED' });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      mockStatsService.getSummary.mockResolvedValue(mockStatsResult);

      const result = await service.getSessionSummary('restaurant-uuid-1', 'session-uuid-1');

      expect(mockStatsService.getSummary).toHaveBeenCalledWith('restaurant-uuid-1', 'session-uuid-1');
      expect(mockRegisterSessionRepository.findById).toHaveBeenCalledWith('session-uuid-1');
      expect(result.session).toEqual(session);
      expect(result.summary).toEqual(mockStatsResult);
    });

    it('throws CashRegisterNotFoundException when findById returns null', async () => {
      mockRegisterSessionRepository.findById.mockResolvedValue(null);

      await expect(
        service.getSessionSummary('restaurant-uuid-1', 'nonexistent'),
      ).rejects.toThrow(CashRegisterNotFoundException);

      expect(mockStatsService.getSummary).not.toHaveBeenCalled();
    });

    it('calls findById then statsService.getSummary (sequential)', async () => {
      const session = mockSession({ status: 'CLOSED' });
      mockRegisterSessionRepository.findById.mockResolvedValue(session);
      mockStatsService.getSummary.mockResolvedValue(mockStatsResult);

      await service.getSessionSummary('restaurant-uuid-1', 'session-uuid-1');

      expect(mockRegisterSessionRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockStatsService.getSummary).toHaveBeenCalledTimes(1);
    });

    describe('cross-tenant (H-12)', () => {
      it('throws CashRegisterNotFoundException when session belongs to another restaurant', async () => {
        const otherRestSession = mockSession({ restaurantId: 'restaurant-OTRO', status: 'CLOSED' });
        mockRegisterSessionRepository.findById.mockResolvedValue(otherRestSession);

        await expect(
          service.getSessionSummary('restaurant-uuid-1', 'session-uuid-1'),
        ).rejects.toThrow(CashRegisterNotFoundException);

        expect(mockStatsService.getSummary).not.toHaveBeenCalled();
      });
    });
  });
});
