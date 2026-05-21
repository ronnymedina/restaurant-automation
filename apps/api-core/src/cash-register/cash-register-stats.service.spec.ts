import { Test } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';

import { CashRegisterStatsService } from './cash-register-stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from './exceptions/cash-register.exceptions';

const SESSION_ID = 'session-uuid';
const RESTAURANT_ID = 'restaurant-uuid';

const mockPrisma = {
  order: { groupBy: jest.fn() },
  orderItem: { groupBy: jest.fn() },
  product: { findMany: jest.fn() },
};

const mockCashShiftRepository = {
  findById: jest.fn(),
};

describe('CashRegisterStatsService', () => {
  let service: CashRegisterStatsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CashRegisterStatsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CashShiftRepository, useValue: mockCashShiftRepository },
      ],
    }).compile();

    service = module.get(CashRegisterStatsService);
    jest.clearAllMocks();
  });

  function setupValidSession(restaurantId = RESTAURANT_ID) {
    mockCashShiftRepository.findById.mockResolvedValue({
      id: SESSION_ID,
      restaurantId,
    });
  }

  function setupEmptyOrders() {
    mockPrisma.order.groupBy.mockResolvedValue([]);
    mockPrisma.orderItem.groupBy.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([]);
  }

  describe('getStats', () => {
    it('lanza CashRegisterNotFoundException cuando la sesión no existe', async () => {
      mockCashShiftRepository.findById.mockResolvedValue(null);
      setupEmptyOrders();

      await expect(service.getStats(SESSION_ID, RESTAURANT_ID)).rejects.toThrow(
        CashRegisterNotFoundException,
      );
    });

    it('lanza CashRegisterNotFoundException cuando la sesión pertenece a otro restaurante', async () => {
      setupValidSession('otro-restaurante-id');
      setupEmptyOrders();

      await expect(service.getStats(SESSION_ID, RESTAURANT_ID)).rejects.toThrow(
        CashRegisterNotFoundException,
      );
    });

    it('retorna stats en cero para una sesión vacía', async () => {
      setupValidSession();
      setupEmptyOrders();

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.counts).toEqual({
        total: 0, created: 0, confirmed: 0, processing: 0,
        served: 0, completed: 0, cancelled: 0, pending: 0,
      });
      expect(stats.revenue).toEqual({ completed: 0n, pending: 0n, averageTicket: 0n });
      expect(stats.byPaymentMethod).toEqual([]);
      expect(stats.byOrderType).toEqual([]);
      expect(stats.byOrderSource).toEqual([]);
      expect(stats.topProducts).toEqual([]);
    });

    it('cuenta cada status correctamente y calcula pending', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.CREATED,    paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK',  _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CONFIRMED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.SERVED,     paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1200n } },
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK',  _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.counts.total).toBe(9);
      expect(stats.counts.created).toBe(2);
      expect(stats.counts.confirmed).toBe(1);
      expect(stats.counts.processing).toBe(1);
      expect(stats.counts.served).toBe(1);
      expect(stats.counts.completed).toBe(3);
      expect(stats.counts.cancelled).toBe(1);
      expect(stats.counts.pending).toBe(5); // 9 - 3 completed - 1 cancelled
    });

    it('calcula revenue correctamente (completed, pending, averageTicket)', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 2 }, _sum: { totalAmount: 4000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.revenue.completed).toBe(4000n);
      expect(stats.revenue.pending).toBe(1500n);    // PROCESSING; CANCELLED excluido
      expect(stats.revenue.averageTicket).toBe(2000n); // 4000n / 2
    });

    it('averageTicket es 0n cuando no hay pedidos completados', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.CREATED, paymentMethod: null, orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1000n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.revenue.averageTicket).toBe(0n);
    });

    it('byPaymentMethod incluye solo órdenes COMPLETED', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 2 }, _sum: { totalAmount: 4000n } },
        { status: OrderStatus.COMPLETED, paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CANCELLED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  500n } },
        { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1000n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.byPaymentMethod).toHaveLength(2);
      expect(stats.byPaymentMethod).toEqual(
        expect.arrayContaining([
          { method: 'CASH', count: 2, total: 4000n },
          { method: 'CARD', count: 1, total: 2000n },
        ]),
      );
    });

    it('byOrderType agrega todos los statuses incluyendo CANCELLED', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP',   orderSource: 'STAFF', _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'DELIVERY', orderSource: 'KIOSK', _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CANCELLED, paymentMethod: null,   orderType: 'PICKUP',   orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.byOrderType).toEqual(
        expect.arrayContaining([
          { type: 'PICKUP', count: 4 },
          { type: 'DELIVERY', count: 2 },
        ]),
      );
    });

    it('retorna top products con id, name, quantity y total', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'prod-1', _sum: { quantity: 10, subtotal: 5000n } },
        { productId: 'prod-2', _sum: { quantity:  5, subtotal: 2500n } },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Burger' },
        { id: 'prod-2', name: 'Fries'  },
      ]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.topProducts).toEqual([
        { id: 'prod-1', name: 'Burger', quantity: 10, total: 5000n },
        { id: 'prod-2', name: 'Fries',  quantity:  5, total: 2500n },
      ]);
    });

    it('no llama product.findMany cuando no hay top products', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);

      await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });
  });
});
