import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductRepository } from './product.repository';
import { CategoryRepository } from './category.repository';
import { productConfig } from './product.config';
import { ProductEventsService } from '../events/products.events';
import { EntityNotFoundException } from '../common/exceptions';
import { InsufficientStockException } from './exceptions/products.exceptions';
import { DEFAULT_CATEGORY_NAME } from '../config';

const mockProductRepo = {
  create: jest.fn(),
  createMany: jest.fn(),
  findByRestaurantId: jest.fn(),
  findByRestaurantIdPaginated: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockCategoryRepo = {
  findOrCreate: jest.fn(),
};
const mockEvents = {
  emitProductCreated: jest.fn(),
  emitProductUpdated: jest.fn(),
  emitProductDeleted: jest.fn(),
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductRepository, useValue: mockProductRepo },
        { provide: CategoryRepository, useValue: mockCategoryRepo },
        { provide: productConfig.KEY, useValue: { batchSize: 10, defaultPageSize: 10 } },
        { provide: ProductEventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  describe('getOrCreateDefaultCategory', () => {
    it('calls findOrCreate with DEFAULT_CATEGORY_NAME constant', async () => {
      const category = { id: 'cat-1', name: DEFAULT_CATEGORY_NAME, restaurantId: 'r1' };
      mockCategoryRepo.findOrCreate.mockResolvedValue(category);
      const result = await service.getOrCreateDefaultCategory('r1');
      expect(mockCategoryRepo.findOrCreate).toHaveBeenCalledWith(
        { name: DEFAULT_CATEGORY_NAME, restaurantId: 'r1' },
        undefined,
      );
      expect(result).toEqual(category);
    });
  });

  describe('createProduct', () => {
    it('creates product and emits event', async () => {
      const product = { id: 'p1', name: 'Test', restaurantId: 'r1', categoryId: 'c1', price: 5, stock: null };
      mockProductRepo.create.mockResolvedValue(product);
      const result = await service.createProduct('r1', { name: 'Test', price: 5 }, 'c1');
      expect(mockProductRepo.create).toHaveBeenCalled();
      expect(mockEvents.emitProductCreated).toHaveBeenCalledWith('r1');
      expect(result).toEqual(product);
    });
  });

  describe('findById', () => {
    it('throws EntityNotFoundException when product not found', async () => {
      mockProductRepo.findById.mockResolvedValue(null);
      await expect(service.findById('p999', 'r1')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns product when found', async () => {
      const product = { id: 'p1', restaurantId: 'r1' };
      mockProductRepo.findById.mockResolvedValue(product);
      expect(await service.findById('p1', 'r1')).toEqual(product);
    });
  });

  describe('decrementStock', () => {
    it('throws EntityNotFoundException when product not found', async () => {
      mockProductRepo.findById.mockResolvedValue(null);
      await expect(service.decrementStock('p999', 'r1', 1)).rejects.toThrow(EntityNotFoundException);
    });

    it('returns product unchanged when stock is null (infinite)', async () => {
      const product = { id: 'p1', stock: null };
      mockProductRepo.findById.mockResolvedValue(product);
      const result = await service.decrementStock('p1', 'r1', 5);
      expect(result).toEqual(product);
      expect(mockProductRepo.update).not.toHaveBeenCalled();
    });

    it('throws InsufficientStockException when stock < amount', async () => {
      mockProductRepo.findById.mockResolvedValue({ id: 'p1', name: 'Widget', stock: 2 });
      await expect(service.decrementStock('p1', 'r1', 5)).rejects.toThrow(InsufficientStockException);
    });

    it('decrements stock when sufficient', async () => {
      mockProductRepo.findById.mockResolvedValue({ id: 'p1', name: 'Widget', stock: 10, restaurantId: 'r1' });
      mockProductRepo.update.mockResolvedValue({ id: 'p1', stock: 7 });
      const result = await service.decrementStock('p1', 'r1', 3);
      expect(mockProductRepo.update).toHaveBeenCalledWith('p1', 'r1', { stock: 7 });
      expect(result.stock).toBe(7);
    });
  });

  describe('deleteProduct', () => {
    it('emits deleted event after deletion', async () => {
      const product = { id: 'p1', restaurantId: 'r1' };
      mockProductRepo.findById.mockResolvedValue(product);
      mockProductRepo.delete.mockResolvedValue(product);
      await service.deleteProduct('p1', 'r1');
      expect(mockEvents.emitProductDeleted).toHaveBeenCalledWith('r1');
    });
  });
});
