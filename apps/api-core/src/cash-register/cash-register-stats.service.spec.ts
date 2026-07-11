import { Test } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';

import { CashRegisterStatsService } from './cash-register-stats.service';
import { OrderShiftReportRepository } from '../orders/order-shift-report.repository';

const SESSION_ID = 'session-uuid';
const RESTAURANT_ID = 'restaurant-uuid';

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

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

      expect(summary.counts.total).toBe(0);
      expect(summary.counts.pending).toBe(0);
      expect(summary.counts.completed).toBe(0);
      expect(summary.counts.cancelled).toBe(0);
      expect(summary.revenue).toEqual({ collected: 0n, pending: 0n, averageTicket: 0n });
      expect(summary.byPaymentMethod).toEqual([]);
      expect(summary.byOrderType).toEqual([]);
      expect(summary.byOrderSource).toEqual([]);
      expect(summary.topProducts).toEqual([]);
    });

    it('cuenta cada status correctamente y calcula pending', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.CREATED,    paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: false, _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CONFIRMED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.SERVED,     paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1200n } },
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

      expect(summary.counts.total).toBe(9);
      expect(summary.counts.pending).toBe(5); // 9 - 3 completed - 1 cancelled
      expect(summary.counts.created).toBe(2);
      expect(summary.counts.confirmed).toBe(1);
      expect(summary.counts.processing).toBe(1);
      expect(summary.counts.served).toBe(1);
      expect(summary.counts.completed).toBe(3);
      expect(summary.counts.cancelled).toBe(1);
    });

    it('calcula revenue por isPaid: collected, pending y averageTicket', async () => {
      // A: completada+pagada; B: servida+pagada (dinero ya en caja); C: en preparación sin pagar; D: cancelada
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount: 10000n } },
        { status: OrderStatus.SERVED,     paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount:  5000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:  3000n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:   800n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

      expect(summary.revenue.collected).toBe(15000n);     // A + B (ambas pagadas)
      expect(summary.revenue.pending).toBe(3000n);        // C (sin pagar); CANCELLED excluida
      expect(summary.revenue.averageTicket).toBe(7500n);  // 15000 / 2 órdenes pagadas
    });

    it('averageTicket es 0n cuando no hay órdenes pagadas', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.CREATED, paymentMethod: null, orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1000n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

      expect(summary.revenue.collected).toBe(0n);
      expect(summary.revenue.averageTicket).toBe(0n);
    });

    it('byPaymentMethod incluye solo órdenes pagadas (isPaid), excluye no pagadas y canceladas', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 2 }, _sum: { totalAmount: 4000n } },
        { status: OrderStatus.SERVED,    paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.PROCESSING,paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', isPaid: false, _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.CANCELLED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'KIOSK', isPaid: true,  _count: { id: 1 }, _sum: { totalAmount:  500n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

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
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP',   orderSource: 'STAFF', isPaid: true,  _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'DELIVERY', orderSource: 'KIOSK', isPaid: false, _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CANCELLED, paymentMethod: null,   orderType: 'PICKUP',   orderSource: 'KIOSK', isPaid: false, _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

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

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

      expect(summary.topProducts).toEqual([
        { id: 'prod-1', name: 'Burger', quantity: 10, total: 5000n },
        { id: 'prod-2', name: 'Fries',  quantity:  5, total: 2500n },
      ]);
    });

    it('retorna topProducts vacío cuando no hay items', async () => {
      mockOrderShiftReport.groupOrdersByShift.mockResolvedValue([]);
      mockOrderShiftReport.getTopProductsWithNamesByShift.mockResolvedValue([]);

      const summary = await service.getSummary(RESTAURANT_ID, SESSION_ID);

      expect(summary.topProducts).toEqual([]);
    });
  });

  describe('tenant filter (H-12)', () => {
    it('propaga restaurantId al orderShiftReport', async () => {
      setupEmptyOrders();

      await service.getSummary(RESTAURANT_ID, SESSION_ID);

      expect(mockOrderShiftReport.groupOrdersByShift).toHaveBeenCalledWith(RESTAURANT_ID, SESSION_ID);
      expect(mockOrderShiftReport.getTopProductsWithNamesByShift).toHaveBeenCalledWith(RESTAURANT_ID, SESSION_ID);
    });
  });
});
