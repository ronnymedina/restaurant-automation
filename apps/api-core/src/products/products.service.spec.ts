import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductRepository } from './product.repository';
import { CategoryRepository } from './category.repository';
import { ProductEventsService } from '../events/products.events';
import { EntityNotFoundException } from '../common/exceptions';
import { InsufficientStockException } from './exceptions/products.exceptions';
import { CategoriesService } from './categories.service';
import { productConfig } from './product.config';
import { PRODUCTS_DEFAULT_CATEGORY_NAME } from '../config';

const mockProductRepo = {
  create: jest.fn(),
  createMany: jest.fn(),
  findByRestaurantId: jest.fn(),
  findByRestaurantIdPaginated: jest.fn(),
  findById: jest.fn(),
  findProductAndThrowIfNotFound: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockCategoryRepo = {
  findOrCreate: jest.fn(),
  findById: jest.fn(),
};
const mockCategoryService = {
  findCategoryAndThrowIfNotFound: jest.fn(),
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
        { provide: CategoriesService, useValue: mockCategoryService },
        { provide: productConfig.KEY, useValue: { batchSize: 10, defaultPageSize: 10, defaultCategoryName: PRODUCTS_DEFAULT_CATEGORY_NAME } },
        { provide: ProductEventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  describe('getOrCreateDefaultCategory', () => {
    it('calls findOrCreate with DEFAULT_CATEGORY_NAME constant', async () => {
      const category = { id: 'cat-1', name: PRODUCTS_DEFAULT_CATEGORY_NAME, restaurantId: 'r1' };
      mockCategoryRepo.findOrCreate.mockResolvedValue(category);
      const result = await service.getOrCreateDefaultCategory('r1');
      expect(mockCategoryRepo.findOrCreate).toHaveBeenCalledWith(
        { name: PRODUCTS_DEFAULT_CATEGORY_NAME, restaurantId: 'r1' },
        undefined,
      );
      expect(result).toEqual(category);
    });
  });

  describe('createProduct', () => {
    it('creates product and emits event', async () => {
      const product = { id: 'p1', name: 'Test', restaurantId: 'r1', categoryId: 'c1', price: 500n, stock: null };
      mockCategoryRepo.findById.mockResolvedValue({ id: 'c1', restaurantId: 'r1' });
      mockProductRepo.create.mockResolvedValue(product);
      // Simulate that the DTO @Transform already converted 500 -> 500n
      const result = await service.createProduct('r1', { name: 'Test', price: 500n, categoryId: 'c1' } as any);

      expect(mockProductRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: 500n }),
      );
      expect(mockEvents.emitProductCreated).toHaveBeenCalledWith('r1');
      // The result should have the original price (BigInt) as the service does not serialize it anymore
      expect(result).toEqual(expect.objectContaining({ id: 'p1', price: 500n }));
    });

    it('receives BigInt centavos correctly from DTO', async () => {
      const product = { id: 'p2', name: 'Pricey', restaurantId: 'r1', categoryId: 'c1', price: 1250n, stock: null };
      mockCategoryRepo.findById.mockResolvedValue({ id: 'c1', restaurantId: 'r1' });
      mockProductRepo.create.mockResolvedValue(product);

      await service.createProduct('r1', { name: 'Pricey', price: 1250n, categoryId: 'c1' } as any);

      expect(mockProductRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: 1250n }),
      );
    });
  });

  describe('findById', () => {
    it('throws EntityNotFoundException when product not found', async () => {
      mockProductRepo.findById.mockResolvedValue(null);
      await expect(service.findById('p999', 'r1')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns product when found', async () => {
      const product = { id: 'p1', restaurantId: 'r1', price: 1250n };
      mockProductRepo.findById.mockResolvedValue(product);
      const result = await service.findById('p1', 'r1');
      expect(result).toEqual(expect.objectContaining({ id: 'p1', price: 1250n }));
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
    it('soft deletes product by calling update with deletedAt', async () => {
      const product = { id: 'p1', restaurantId: 'r1', deletedAt: null };
      mockProductRepo.findById.mockResolvedValue(product);
      const softDeleted = { ...product, deletedAt: new Date() };
      mockProductRepo.delete.mockResolvedValue(softDeleted);
      const result = await service.deleteProduct('p1', 'r1');
      expect(mockProductRepo.delete).toHaveBeenCalledWith('p1', 'r1');
      expect(mockEvents.emitProductDeleted).toHaveBeenCalledWith('r1');
      expect(result.deletedAt).toBeDefined();
    });

    it('throws EntityNotFoundException when product not found', async () => {
      mockProductRepo.findById.mockResolvedValue(null);
      await expect(service.deleteProduct('bad', 'r1')).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe('createProductsBatch', () => {
    it('creates products in batches and returns totals', async () => {
      mockProductRepo.createMany.mockResolvedValue(3);
      const products = [
        { name: 'A', price: 1n },
        { name: 'B', price: 2n },
        { name: 'C', price: 3n },
      ];
      const result = await service.createProductsBatch('r1', 'c1', products);
      expect(mockProductRepo.createMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ totalCreated: 3, batches: 1 });
    });

    it('splits into multiple batches when products exceed batch size', async () => {
      mockProductRepo.createMany.mockResolvedValue(5);
      // Use a small batchSize by reinitializing the service with batchSize=5
      const module = await Test.createTestingModule({
        providers: [
          ProductsService,
          { provide: ProductRepository, useValue: mockProductRepo },
          { provide: CategoryRepository, useValue: mockCategoryRepo },
          { provide: CategoriesService, useValue: mockCategoryService },
          { provide: productConfig.KEY, useValue: { batchSize: 2, defaultPageSize: 10, defaultCategoryName: PRODUCTS_DEFAULT_CATEGORY_NAME } },
          { provide: ProductEventsService, useValue: mockEvents },
        ],
      }).compile();
      const smallBatchService = module.get<ProductsService>(ProductsService);
      mockProductRepo.createMany.mockResolvedValue(2);

      const products = Array.from({ length: 5 }, (_, i) => ({ name: `P${i}`, price: BigInt(i + 1) }));
      const result = await smallBatchService.createProductsBatch('r1', 'c1', products);
      expect(result.batches).toBe(3);
    });
  });

  describe('findByRestaurantIdPaginated', () => {
    it('returns paginated results with meta', async () => {
      const data = [{ id: 'p1', price: 500n }, { id: 'p2', price: 1000n }];
      mockProductRepo.findByRestaurantIdPaginated.mockResolvedValue({ data, total: 2 });
      const result = await service.findByRestaurantIdPaginated('r1', 1, 10);
      expect(result.data[0]).toEqual(expect.objectContaining({ id: 'p1', price: 500n }));
      expect(result.data[1]).toEqual(expect.objectContaining({ id: 'p2', price: 1000n }));
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });
    });

    it('uses default page and limit when not provided', async () => {
      mockProductRepo.findByRestaurantIdPaginated.mockResolvedValue({ data: [], total: 0 });
      const result = await service.findByRestaurantIdPaginated('r1');
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10); // defaultPageSize from mock config
    });
  });

  describe('updateProduct', () => {
    it('updates product and emits event', async () => {
      const product = { id: 'p1', restaurantId: 'r1', name: 'Updated', price: 1000n };
      mockProductRepo.findProductAndThrowIfNotFound.mockResolvedValue(product);
      mockProductRepo.update.mockResolvedValue(product);
      const result = await service.updateProduct('p1', 'r1', { name: 'Updated' } as any);
      expect(mockProductRepo.update).toHaveBeenCalledWith('p1', 'r1', expect.objectContaining({ name: 'Updated' }));
      expect(mockEvents.emitProductUpdated).toHaveBeenCalledWith('r1');
      expect(result).toEqual(expect.objectContaining({ id: 'p1', price: 1000n }));
    });

    it('throws EntityNotFoundException when product not found', async () => {
      mockProductRepo.findProductAndThrowIfNotFound.mockRejectedValue(new EntityNotFoundException('Product', 'bad'));
      await expect(service.updateProduct('bad', 'r1', {} as any)).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe('createDemoProducts', () => {
    it('creates 3 demo products and returns total count', async () => {
      mockProductRepo.createMany.mockResolvedValue(3);
      const result = await service.createDemoProducts('r1', 'c1');
      expect(mockProductRepo.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Producto Demo 1', restaurantId: 'r1', categoryId: 'c1' }),
          expect.objectContaining({ name: 'Producto Demo 2' }),
          expect.objectContaining({ name: 'Producto Demo 3' }),
        ]),
      );
      expect(result).toBe(3);
    });
  });

  describe('findByRestaurantId', () => {
    it('returns products for a restaurant', async () => {
      const products = [{ id: 'p1', price: 500n }];
      mockProductRepo.findByRestaurantId.mockResolvedValue(products);
      const result = await service.findByRestaurantId('r1');
      expect(result[0]).toEqual(expect.objectContaining({ id: 'p1', price: 500n }));
    });
  });
});
