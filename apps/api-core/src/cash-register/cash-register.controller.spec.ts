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
  getSessionStats:   jest.fn(),
};

const mockStatsService    = { getStats: jest.fn() };
const mockTimezoneService = { getTimezone: jest.fn() };
const mockCashShiftRepo   = { findById: jest.fn() };

const emptyStats = () => ({
  total: 0,
  pending: 0,
  counts: [],
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
    it('retorna stats en cero cuando no hay sesión abierta', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(null);

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.total).toBe(0);
      expect(result.revenue.completed).toBe(0);
      expect(result.revenue.pending).toBe(0);
      expect(result.revenue.averageTicket).toBe(0);
    });

    it('convierte centavos a pesos en revenue', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getStats.mockResolvedValue({
        ...emptyStats(),
        revenue: { completed: 4000n, pending: 1500n, averageTicket: 2000n },
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.revenue.completed).toBe(40);     // 4000n centavos → $40
      expect(result.revenue.pending).toBe(15);        // 1500n centavos → $15
      expect(result.revenue.averageTicket).toBe(20);  // 2000n centavos → $20
    });

    it('convierte centavos a pesos en byPaymentMethod', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getStats.mockResolvedValue({
        ...emptyStats(),
        byPaymentMethod: [
          { method: 'CASH', count: 3, total: 6000n },
          { method: 'CARD', count: 1, total: 2500n },
        ],
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.byPaymentMethod[0].total).toBe(60);  // 6000n → $60
      expect(result.byPaymentMethod[1].total).toBe(25);  // 2500n → $25
    });

    it('convierte centavos a pesos en topProducts', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getStats.mockResolvedValue({
        ...emptyStats(),
        topProducts: [
          { id: 'prod-1', name: 'Burger', quantity: 5, total: 15000n },
          { id: 'prod-2', name: 'Fries',  quantity: 3, total:  4500n },
        ],
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.topProducts[0].total).toBe(150);  // 15000n → $150
      expect(result.topProducts[1].total).toBe(45);   // 4500n  → $45
    });

    it('no convierte campos no monetarios (total, pending, counts)', async () => {
      mockRegisterService.getOpenSessionId.mockResolvedValue(SESSION_ID);
      mockStatsService.getStats.mockResolvedValue({
        ...emptyStats(),
        total: 7,
        pending: 3,
        counts: [{ status: 'COMPLETED', total: 4 }],
      });

      const result = instanceToPlain(await controller.stats({ restaurantId: RESTAURANT_ID }));

      expect(result.total).toBe(7);
      expect(result.pending).toBe(3);
      expect(result.counts[0].total).toBe(4);
    });
  });
});
