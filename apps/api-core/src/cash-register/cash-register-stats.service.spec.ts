import { Test } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';

import { CashRegisterStatsService } from './cash-register-stats.service';
import { OrderShiftReportRepository } from '../orders/order-shift-report.repository';

const SESSION_ID = 'session-uuid';

const mockOrderShiftReport = {
  groupOrdersByShift: jest.fn(),
  getTopProductsWithNamesByShift: jest.fn(),
};

describe('CashRegisterStatsService', () => {
  let service: CashRegisterStatsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CashRegisterStatsService,
        { provide: OrderShiftReportRepository, useValue: mockOrderShiftReport },
      ],
    }).compile();

    service = module.get(CashRegisterStatsService);
    jest.clearAllMocks();
  });

  function setupEmptyOrders() {
    mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([]);
    mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);
  }

  describe('getSummary', () => {
    it('retorna summary en cero para una sesión vacía', async () => {
      setupEmptyOrders();

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.counts.total).toBe(0);
      expect(summary.counts.pending).toBe(0);
      expect(summary.counts.completed).toBe(0);
      expect(summary.counts.cancelled).toBe(0);
      expect(summary.revenue).toEqual({ completed: 0n, pending: 0n, averageTicket: 0n });
      expect(summary.byPaymentMethod).toEqual([]);
      expect(summary.byOrderType).toEqual([]);
      expect(summary.byOrderSource).toEqual([]);
      expect(summary.topProducts).toEqual([]);
    });

    it('cuenta cada status correctamente y calcula pending', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.CREATED,    paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK',  _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CONFIRMED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.SERVED,     paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1200n } },
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK',  _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.counts.total).toBe(9);
      expect(summary.counts.pending).toBe(5); // 9 - 3 completed - 1 cancelled
      expect(summary.counts.created).toBe(2);
      expect(summary.counts.confirmed).toBe(1);
      expect(summary.counts.processing).toBe(1);
      expect(summary.counts.served).toBe(1);
      expect(summary.counts.completed).toBe(3);
      expect(summary.counts.cancelled).toBe(1);
    });

    it('calcula revenue correctamente (completed, pending, averageTicket)', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 2 }, _sum: { totalAmount: 4000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.revenue.completed).toBe(4000n);
      expect(summary.revenue.pending).toBe(1500n);    // PROCESSING; CANCELLED excluido
      expect(summary.revenue.averageTicket).toBe(2000n); // 4000n / 2
    });

    it('averageTicket es 0n cuando no hay pedidos completados', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.CREATED, paymentMethod: null, orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1000n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.revenue.averageTicket).toBe(0n);
    });

    it('byPaymentMethod incluye solo órdenes COMPLETED', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 2 }, _sum: { totalAmount: 4000n } },
        { status: OrderStatus.COMPLETED, paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CANCELLED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  500n } },
        { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1000n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.byPaymentMethod).toHaveLength(2);
      expect(summary.byPaymentMethod).toEqual(
        expect.arrayContaining([
          { method: 'CASH', count: 2, total: 4000n },
          { method: 'CARD', count: 1, total: 2000n },
        ]),
      );
    });

    it('byOrderType agrega todos los statuses incluyendo CANCELLED', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP',   orderSource: 'STAFF', _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'DELIVERY', orderSource: 'KIOSK', _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CANCELLED, paymentMethod: null,   orderType: 'PICKUP',   orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.byOrderType).toEqual(
        expect.arrayContaining([
          { type: 'PICKUP', count: 4 },
          { type: 'DELIVERY', count: 2 },
        ]),
      );
    });

    it('retorna top products con id, name, quantity y total', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([
        { id: 'prod-1', name: 'Burger', quantity: 10, total: 5000n },
        { id: 'prod-2', name: 'Fries',  quantity:  5, total: 2500n },
      ]);

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.topProducts).toEqual([
        { id: 'prod-1', name: 'Burger', quantity: 10, total: 5000n },
        { id: 'prod-2', name: 'Fries',  quantity:  5, total: 2500n },
      ]);
    });

    it('retorna topProducts vacío cuando no hay items', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(SESSION_ID);

      expect(summary.topProducts).toEqual([]);
    });
  });
});
