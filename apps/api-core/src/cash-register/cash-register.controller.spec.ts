import { instanceToPlain } from 'class-transformer';
import { Test } from '@nestjs/testing';

import { CashRegisterController } from './cash-register.controller';
import { CashRegisterService } from './cash-register.service';
import { CashRegisterStatsService } from './cash-register-stats.service';
import { TimezoneService } from '../restaurants/timezone.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';

const RESTAURANT_ID = 'restaurant-uuid';
const SESSION_ID    = 'session-uuid';

const mockRegisterService = {
  getOpenSessionId: jest.fn(),
  openSession:      jest.fn(),
  closeSession:     jest.fn(),
  getSessionHistory: jest.fn(),
  getCurrentSession: jest.fn(),
  getSessionSummary: jest.fn(),
};

const mockStatsService    = { getSummary: jest.fn() };
const mockTimezoneService = { getTimezone: jest.fn() };
const mockCashShiftRepo   = { findById: jest.fn() };

const emptySummary = () => ({
  counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
  revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
  byPaymentMethod: [],
  byOrderType: [],
  byOrderSource: [],
  topProducts: [],
});

describe('CashRegisterController', () => {
  let controller: CashRegisterController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CashRegisterController],
      providers: [
        { provide: CashRegisterService,      useValue: mockRegisterService },
        { provide: CashRegisterStatsService, useValue: mockStatsService },
        { provide: TimezoneService,          useValue: mockTimezoneService },
        { provide: CashShiftRepository,      useValue: mockCashShiftRepo },
      ],
    }).compile();

    controller = module.get(CashRegisterController);
    jest.clearAllMocks();
  });

  describe('GET /stats', () => {
    it('envuelve la respuesta en { summary } incluso sin sesión abierta', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(null);

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.summary).toBeDefined();
      expect(result.summary.counts.total).toBe(0);
      expect(result.summary.revenue.completed).toBe(0);
      expect(result.summary.revenue.pending).toBe(0);
      expect(result.summary.revenue.averageTicket).toBe(0);
    });

    it('convierte centavos a pesos en revenue', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getSummary.mockResolvedValue({
        ...emptySummary(),
        revenue: { completed: 4000n, pending: 1500n, averageTicket: 2000n },
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.summary.revenue.completed).toBe(40);     // 4000n centavos → $40
      expect(result.summary.revenue.pending).toBe(15);        // 1500n centavos → $15
      expect(result.summary.revenue.averageTicket).toBe(20);  // 2000n centavos → $20
    });

    it('convierte centavos a pesos en byPaymentMethod', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getSummary.mockResolvedValue({
        ...emptySummary(),
        byPaymentMethod: [
          { method: 'CASH', count: 3, total: 6000n },
          { method: 'CARD', count: 1, total: 2500n },
        ],
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.summary.byPaymentMethod[0].total).toBe(60);  // 6000n → $60
      expect(result.summary.byPaymentMethod[1].total).toBe(25);  // 2500n → $25
    });

    it('convierte centavos a pesos en topProducts', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getSummary.mockResolvedValue({
        ...emptySummary(),
        topProducts: [
          { id: 'prod-1', name: 'Burger', quantity: 5, total: 15000n },
          { id: 'prod-2', name: 'Fries',  quantity: 3, total:  4500n },
        ],
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.summary.topProducts[0].total).toBe(150);  // 15000n → $150
      expect(result.summary.topProducts[1].total).toBe(45);   // 4500n  → $45
    });

    it('no convierte campos no monetarios (counts)', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getSummary.mockResolvedValue({
        ...emptySummary(),
        counts: { total: 7, pending: 3, created: 1, confirmed: 0, processing: 2, served: 0, completed: 4, cancelled: 0 },
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.summary.counts.total).toBe(7);
      expect(result.summary.counts.pending).toBe(3);
      expect(result.summary.counts.completed).toBe(4);
    });
  });
});
