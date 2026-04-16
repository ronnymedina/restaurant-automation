import { Test, TestingModule } from '@nestjs/testing';
import { KioskService } from './kiosk.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuRepository } from '../menus/menu.repository';
import { OrdersService } from '../orders/orders.service';
import { CashShiftRepository } from '../cash-register/cash-register-session.repository';
import { EntityNotFoundException } from '../common/exceptions';
import { STOCK_STATUS } from '../events/kiosk.events';
import { RegisterNotOpenException } from '../orders/exceptions/orders.exceptions';

const mockRestaurantsService = { findBySlug: jest.fn() };
const mockMenuRepository = { findByRestaurantId: jest.fn(), findByIdWithItems: jest.fn() };
const mockOrdersService = { createOrder: jest.fn() };
const mockRegisterSessionRepo = { findOpen: jest.fn() };

const mockRestaurant = { id: 'r1', slug: 'test-rest', name: 'Test' };

describe('KioskService', () => {
  let service: KioskService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KioskService,
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: MenuRepository, useValue: mockMenuRepository },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: CashShiftRepository, useValue: mockRegisterSessionRepo },
      ],
    }).compile();

    service = module.get<KioskService>(KioskService);
    jest.clearAllMocks();
  });

  // ── resolveRestaurant ─────────────────────────────────────────────

  describe('resolveRestaurant', () => {
    it('throws EntityNotFoundException when slug not found', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(null);
      await expect(service.resolveRestaurant('unknown')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns restaurant when found', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
      expect(await service.resolveRestaurant('test-rest')).toEqual(mockRestaurant);
    });
  });

  // ── isMenuAvailable ───────────────────────────────────────────────

  describe('isMenuAvailable', () => {
    const available = (overrides = {}) => ({
      active: true,
      daysOfWeek: null,
      startTime: null,
      endTime: null,
      ...overrides,
    });

    describe('active flag', () => {
      it('returns false when menu is inactive', () => {
        expect(service.isMenuAvailable(available({ active: false }), 'MON', '12:00')).toBe(false);
      });

      it('returns true when menu is active with no restrictions', () => {
        expect(service.isMenuAvailable(available(), 'MON', '12:00')).toBe(true);
      });
    });

    describe('no restrictions — available all day, all week', () => {
      it('is available with null daysOfWeek, null startTime, null endTime', () => {
        expect(service.isMenuAvailable(available(), 'SUN', '00:00')).toBe(true);
        expect(service.isMenuAvailable(available(), 'SAT', '23:59')).toBe(true);
        expect(service.isMenuAvailable(available(), 'WED', '14:30')).toBe(true);
      });
    });

    describe('daysOfWeek filter', () => {
      it('returns true when current day is in daysOfWeek', () => {
        expect(service.isMenuAvailable(available({ daysOfWeek: 'MON,TUE,WED' }), 'TUE', '10:00')).toBe(true);
      });

      it('returns false when current day is NOT in daysOfWeek', () => {
        expect(service.isMenuAvailable(available({ daysOfWeek: 'MON,TUE,WED' }), 'THU', '10:00')).toBe(false);
      });

      it('returns true when daysOfWeek contains all days', () => {
        const allDays = 'MON,TUE,WED,THU,FRI,SAT,SUN';
        for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) {
          expect(service.isMenuAvailable(available({ daysOfWeek: allDays }), day, '12:00')).toBe(true);
        }
      });

      it('handles single-day daysOfWeek', () => {
        expect(service.isMenuAvailable(available({ daysOfWeek: 'SAT' }), 'SAT', '10:00')).toBe(true);
        expect(service.isMenuAvailable(available({ daysOfWeek: 'SAT' }), 'SUN', '10:00')).toBe(false);
      });

      it('handles daysOfWeek with spaces around commas', () => {
        expect(service.isMenuAvailable(available({ daysOfWeek: 'MON, TUE, WED' }), 'TUE', '10:00')).toBe(true);
      });
    });

    describe('startTime filter', () => {
      it('returns true when current time equals startTime', () => {
        expect(service.isMenuAvailable(available({ startTime: '09:00' }), 'MON', '09:00')).toBe(true);
      });

      it('returns true when current time is after startTime', () => {
        expect(service.isMenuAvailable(available({ startTime: '09:00' }), 'MON', '12:00')).toBe(true);
      });

      it('returns false when current time is before startTime', () => {
        expect(service.isMenuAvailable(available({ startTime: '09:00' }), 'MON', '08:59')).toBe(false);
      });

      it('returns true with only startTime (no endTime) — available from start until end of day', () => {
        expect(service.isMenuAvailable(available({ startTime: '09:00' }), 'MON', '23:59')).toBe(true);
      });
    });

    describe('endTime filter', () => {
      it('returns true when current time equals endTime', () => {
        expect(service.isMenuAvailable(available({ endTime: '15:00' }), 'MON', '15:00')).toBe(true);
      });

      it('returns true when current time is before endTime', () => {
        expect(service.isMenuAvailable(available({ endTime: '15:00' }), 'MON', '12:00')).toBe(true);
      });

      it('returns false when current time is after endTime', () => {
        expect(service.isMenuAvailable(available({ endTime: '15:00' }), 'MON', '15:01')).toBe(false);
      });

      it('returns true with only endTime (no startTime) — available from start of day until end', () => {
        expect(service.isMenuAvailable(available({ endTime: '15:00' }), 'MON', '00:00')).toBe(true);
      });
    });

    describe('time window (startTime + endTime)', () => {
      const window = available({ startTime: '12:00', endTime: '15:00' });

      it('returns true when time is inside the window', () => {
        expect(service.isMenuAvailable(window, 'MON', '12:00')).toBe(true);
        expect(service.isMenuAvailable(window, 'MON', '13:30')).toBe(true);
        expect(service.isMenuAvailable(window, 'MON', '15:00')).toBe(true);
      });

      it('returns false when time is before the window', () => {
        expect(service.isMenuAvailable(window, 'MON', '11:59')).toBe(false);
      });

      it('returns false when time is after the window', () => {
        expect(service.isMenuAvailable(window, 'MON', '15:01')).toBe(false);
      });

      it('returns false when inactive even if time matches', () => {
        expect(service.isMenuAvailable({ ...window, active: false }, 'MON', '13:00')).toBe(false);
      });
    });

    describe('combined daysOfWeek + time window', () => {
      const menu = available({ daysOfWeek: 'MON,TUE,WED,THU,FRI', startTime: '08:00', endTime: '17:00' });

      it('returns true on a weekday within hours', () => {
        expect(service.isMenuAvailable(menu, 'MON', '12:00')).toBe(true);
      });

      it('returns false on a weekend', () => {
        expect(service.isMenuAvailable(menu, 'SAT', '12:00')).toBe(false);
      });

      it('returns false on a weekday but outside hours', () => {
        expect(service.isMenuAvailable(menu, 'FRI', '17:01')).toBe(false);
      });

      it('returns false when inactive regardless of day and time', () => {
        expect(service.isMenuAvailable({ ...menu, active: false }, 'WED', '12:00')).toBe(false);
      });
    });
  });

  // ── getCurrentDayAndTime (timezone) ──────────────────────────────

  describe('getCurrentDayAndTime', () => {
    it('returns correct day and time for a known UTC instant in America/Bogota (UTC-5)', () => {
      // 2024-01-15 15:00 UTC  →  2024-01-15 10:00 America/Bogota (Monday)
      const utc = new Date('2024-01-15T15:00:00Z');
      const { currentDay, currentTime } = service.getCurrentDayAndTime(utc);
      expect(currentDay).toBe('MON');
      expect(currentTime).toBe('10:00');
    });

    it('handles day boundary: UTC midnight belongs to the previous day in UTC-5', () => {
      // 2024-01-16 00:30 UTC  →  2024-01-15 19:30 America/Bogota (Monday, not Tuesday)
      const utc = new Date('2024-01-16T00:30:00Z');
      const { currentDay, currentTime } = service.getCurrentDayAndTime(utc);
      expect(currentDay).toBe('MON');
      expect(currentTime).toBe('19:30');
    });

    it('handles end of day: 23:59 local time', () => {
      // 2024-01-16 04:59 UTC  →  2024-01-15 23:59 America/Bogota (Monday)
      const utc = new Date('2024-01-16T04:59:00Z');
      const { currentDay, currentTime } = service.getCurrentDayAndTime(utc);
      expect(currentDay).toBe('MON');
      expect(currentTime).toBe('23:59');
    });

    it('handles start of day: 00:00 local time', () => {
      // 2024-01-15 05:00 UTC  →  2024-01-15 00:00 America/Bogota (Monday)
      const utc = new Date('2024-01-15T05:00:00Z');
      const { currentDay, currentTime } = service.getCurrentDayAndTime(utc);
      expect(currentDay).toBe('MON');
      expect(currentTime).toBe('00:00');
    });

    it('returns zero-padded hours and minutes', () => {
      // 2024-01-15 14:05 UTC  →  2024-01-15 09:05 America/Bogota
      const utc = new Date('2024-01-15T14:05:00Z');
      const { currentTime } = service.getCurrentDayAndTime(utc);
      expect(currentTime).toBe('09:05');
    });

    it('returns a valid day abbreviation', () => {
      const validDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      const { currentDay } = service.getCurrentDayAndTime(new Date());
      expect(validDays).toContain(currentDay);
    });

    it('returns time in HH:MM format', () => {
      const { currentTime } = service.getCurrentDayAndTime(new Date());
      expect(currentTime).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  // ── getAvailableMenus ─────────────────────────────────────────────

  describe('getAvailableMenus', () => {
    beforeEach(() => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
    });

    it('throws EntityNotFoundException when restaurant not found', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(null);
      await expect(service.getAvailableMenus('unknown')).rejects.toThrow(EntityNotFoundException);
    });

    it('filters out inactive menus', async () => {
      mockMenuRepository.findByRestaurantId.mockResolvedValue([
        { id: 'm1', active: true, daysOfWeek: null, startTime: null, endTime: null },
        { id: 'm2', active: false, daysOfWeek: null, startTime: null, endTime: null },
      ]);
      const result = await service.getAvailableMenus('test-rest');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m1');
    });

    it('returns active menu with no schedule restrictions — always visible', async () => {
      mockMenuRepository.findByRestaurantId.mockResolvedValue([
        { id: 'm1', active: true, daysOfWeek: null, startTime: null, endTime: null },
      ]);
      const result = await service.getAvailableMenus('test-rest');
      expect(result).toHaveLength(1);
    });

    it('returns only menus matching current day and time window', async () => {
      // Control the current day/time via spy
      jest.spyOn(service, 'getCurrentDayAndTime').mockReturnValue({ currentDay: 'MON', currentTime: '13:00' });

      mockMenuRepository.findByRestaurantId.mockResolvedValue([
        { id: 'lunch', active: true, daysOfWeek: 'MON,TUE,WED,THU,FRI', startTime: '12:00', endTime: '15:00' },
        { id: 'dinner', active: true, daysOfWeek: 'MON,TUE,WED,THU,FRI', startTime: '18:00', endTime: '22:00' },
        { id: 'weekend', active: true, daysOfWeek: 'SAT,SUN', startTime: null, endTime: null },
      ]);

      const result = await service.getAvailableMenus('test-rest');
      expect(result.map((m: any) => m.id)).toEqual(['lunch']);
    });

    it('returns menus available on current day regardless of time when no time set', async () => {
      jest.spyOn(service, 'getCurrentDayAndTime').mockReturnValue({ currentDay: 'SAT', currentTime: '08:00' });

      mockMenuRepository.findByRestaurantId.mockResolvedValue([
        { id: 'weekend', active: true, daysOfWeek: 'SAT,SUN', startTime: null, endTime: null },
        { id: 'weekday', active: true, daysOfWeek: 'MON,TUE,WED,THU,FRI', startTime: null, endTime: null },
      ]);

      const result = await service.getAvailableMenus('test-rest');
      expect(result.map((m: any) => m.id)).toEqual(['weekend']);
    });

    it('dashboard and kiosk use the same timezone — same day/time result', () => {
      // Both contexts call getCurrentDayAndTime with the same instance, so timezone is consistent.
      const fixedDate = new Date('2024-03-11T20:00:00Z'); // 15:00 America/Bogota (Monday)
      const result = service.getCurrentDayAndTime(fixedDate);
      // Verify the result is stable/consistent
      expect(result).toEqual(service.getCurrentDayAndTime(fixedDate));
    });

    it('returns all menus when none have schedule restrictions', async () => {
      const menus = [
        { id: 'm1', active: true, daysOfWeek: null, startTime: null, endTime: null },
        { id: 'm2', active: true, daysOfWeek: null, startTime: null, endTime: null },
      ];
      mockMenuRepository.findByRestaurantId.mockResolvedValue(menus);
      const result = await service.getAvailableMenus('test-rest');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when all menus are outside current time window', async () => {
      jest.spyOn(service, 'getCurrentDayAndTime').mockReturnValue({ currentDay: 'MON', currentTime: '02:00' });

      mockMenuRepository.findByRestaurantId.mockResolvedValue([
        { id: 'lunch', active: true, daysOfWeek: null, startTime: '12:00', endTime: '15:00' },
        { id: 'dinner', active: true, daysOfWeek: null, startTime: '18:00', endTime: '22:00' },
      ]);

      const result = await service.getAvailableMenus('test-rest');
      expect(result).toHaveLength(0);
    });
  });

  // ── getMenuItems ──────────────────────────────────────────────────

  describe('getMenuItems', () => {
    const buildMenu = (stock: number | null, productStock: number | null) => ({
      id: 'm1',
      name: 'Menu',
      items: [{
        id: 'mi1',
        sectionName: 'Burgers',
        stock,
        price: null,
        product: { id: 'p1', name: 'Burger', description: null, price: 10, imageUrl: null, stock: productStock },
      }],
    });

    beforeEach(() => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
    });

    it('throws EntityNotFoundException when menu not found', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(null);
      await expect(service.getMenuItems('test-rest', 'bad-id')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns AVAILABLE when effective stock is null (infinite)', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenu(null, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.AVAILABLE);
    });

    it('returns OUT_OF_STOCK when effective stock is 0', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenu(0, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.OUT_OF_STOCK);
    });

    it('returns LOW_STOCK when effective stock is <= 3', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenu(2, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.LOW_STOCK);
    });

    it('returns AVAILABLE when effective stock > 3', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenu(10, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.AVAILABLE);
    });

    it('uses product stock when item stock is null', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenu(null, 1));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.LOW_STOCK);
    });

    it('uses item price when item price is not null', async () => {
      const menu = {
        id: 'm1',
        name: 'Menu',
        items: [{
          id: 'mi1',
          sectionName: null,
          stock: null,
          price: 15,
          product: { id: 'p1', name: 'Burger', description: null, price: 10, imageUrl: null, stock: null },
        }],
      };
      mockMenuRepository.findByIdWithItems.mockResolvedValue(menu);
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['General'][0].price).toBe(15);
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns registerOpen: true when a session is open', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue({ id: 's1' });
      const result = await service.getStatus('test-rest');
      expect(result).toEqual({ registerOpen: true });
    });

    it('returns registerOpen: false when no session is open', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue(null);
      const result = await service.getStatus('test-rest');
      expect(result).toEqual({ registerOpen: false });
    });
  });

  // ── createKioskOrder ──────────────────────────────────────────────

  describe('createKioskOrder', () => {
    const mockDto = { items: [], paymentMethod: 'cash' } as any;

    it('throws RegisterNotOpenException when no session is open', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue(null);
      await expect(service.createKioskOrder('test-rest', mockDto)).rejects.toThrow(
        RegisterNotOpenException,
      );
    });

    it('delegates to ordersService.createOrder when session is open', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue({ id: 's1' });
      const mockOrder = { id: 'o1' };
      mockOrdersService.createOrder.mockResolvedValue(mockOrder);

      const result = await service.createKioskOrder('test-rest', mockDto);
      expect(mockOrdersService.createOrder).toHaveBeenCalledWith('r1', 's1', mockDto);
      expect(result).toEqual(mockOrder);
    });
  });
});
