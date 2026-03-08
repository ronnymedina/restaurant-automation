import { Test, TestingModule } from '@nestjs/testing';
import { KioskService } from './kiosk.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuRepository } from '../menus/menu.repository';
import { OrdersService } from '../orders/orders.service';
import { CashRegisterSessionRepository } from '../cash-register/cash-register-session.repository';
import { EntityNotFoundException } from '../common/exceptions';
import { STOCK_STATUS } from '../events/kiosk.events';

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
  });
});
