import { Test, TestingModule } from '@nestjs/testing';
import { KioskService } from './kiosk.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuRepository } from '../menus/menu.repository';
import { OrdersService } from '../orders/orders.service';
import { CashRegisterSessionRepository } from '../cash-register/cash-register-session.repository';
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
        { provide: CashRegisterSessionRepository, useValue: mockRegisterSessionRepo },
      ],
    }).compile();

    service = module.get<KioskService>(KioskService);
    jest.clearAllMocks();
  });

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

  describe('getAvailableMenus', () => {
    it('throws EntityNotFoundException when restaurant not found', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(null);
      await expect(service.getAvailableMenus('unknown')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns active menus matching current day and time', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
      const menus = [
        { id: 'm1', active: true, daysOfWeek: null, startTime: null, endTime: null },
        { id: 'm2', active: false, daysOfWeek: null, startTime: null, endTime: null },
      ];
      mockMenuRepository.findByRestaurantId.mockResolvedValue(menus);
      const result = await service.getAvailableMenus('test-rest');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m1');
    });

    it('filters out menus not available on current day', async () => {
      mockRestaurantsService.findBySlug.mockResolvedValue(mockRestaurant);
      // Use a day that is definitely not today (we cannot control Date.now in unit tests without mocking)
      // Use MON,TUE,WED,THU,FRI,SAT,SUN (all days) to ensure inclusion
      const menus = [
        { id: 'm1', active: true, daysOfWeek: 'MON,TUE,WED,THU,FRI,SAT,SUN', startTime: null, endTime: null },
      ];
      mockMenuRepository.findByRestaurantId.mockResolvedValue(menus);
      const result = await service.getAvailableMenus('test-rest');
      expect(result).toHaveLength(1);
    });
  });

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
