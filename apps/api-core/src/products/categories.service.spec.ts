// apps/api-core/src/products/categories.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { CategoryRepository } from './category.repository';
import { productConfig } from './product.config';
import { ProductEventsService } from '../events/products.events';
import { EntityNotFoundException } from '../common/exceptions';

const mockCategoryRepo = {
  findByRestaurantId: jest.fn(),
  findByRestaurantIdPaginated: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockEvents = {
  emitCategoryCreated: jest.fn(),
  emitCategoryUpdated: jest.fn(),
  emitCategoryDeleted: jest.fn(),
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CategoryRepository, useValue: mockCategoryRepo },
        { provide: productConfig.KEY, useValue: { defaultPageSize: 10 } },
        { provide: ProductEventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  describe('createCategory', () => {
    it('creates category and emits event', async () => {
      const cat = { id: 'c1', name: 'Burgers', restaurantId: 'r1' };
      mockCategoryRepo.create.mockResolvedValue(cat);
      const result = await service.createCategory('r1', 'Burgers');
      expect(mockCategoryRepo.create).toHaveBeenCalledWith({ name: 'Burgers', restaurantId: 'r1' });
      expect(mockEvents.emitCategoryCreated).toHaveBeenCalledWith('r1');
      expect(result).toEqual(cat);
    });
  });

  describe('updateCategory', () => {
    it('throws EntityNotFoundException when category not found', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);
      await expect(service.updateCategory('c999', 'r1', { name: 'X' })).rejects.toThrow(EntityNotFoundException);
    });

    it('updates category and emits event', async () => {
      const cat = { id: 'c1', name: 'Burgers', restaurantId: 'r1' };
      mockCategoryRepo.findById.mockResolvedValue(cat);
      mockCategoryRepo.update.mockResolvedValue({ ...cat, name: 'Updated' });
      const result = await service.updateCategory('c1', 'r1', { name: 'Updated' });
      expect(mockCategoryRepo.update).toHaveBeenCalledWith('c1', 'r1', { name: 'Updated' });
      expect(mockEvents.emitCategoryUpdated).toHaveBeenCalledWith('r1');
      expect(result.name).toBe('Updated');
    });
  });

  describe('deleteCategory', () => {
    it('throws EntityNotFoundException when category not found', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);
      await expect(service.deleteCategory('c999', 'r1')).rejects.toThrow(EntityNotFoundException);
    });

    it('deletes category and emits event', async () => {
      const cat = { id: 'c1', name: 'Burgers', restaurantId: 'r1' };
      mockCategoryRepo.findById.mockResolvedValue(cat);
      mockCategoryRepo.delete.mockResolvedValue(cat);
      const result = await service.deleteCategory('c1', 'r1');
      expect(mockCategoryRepo.delete).toHaveBeenCalledWith('c1', 'r1');
      expect(mockEvents.emitCategoryDeleted).toHaveBeenCalledWith('r1');
      expect(result).toEqual(cat);
    });
  });

  describe('findByRestaurantIdPaginated', () => {
    it('returns paginated result with correct meta', async () => {
      mockCategoryRepo.findByRestaurantIdPaginated.mockResolvedValue({ data: [], total: 0 });
      const result = await service.findByRestaurantIdPaginated('r1', 1, 10);
      expect(result.meta.total).toBe(0);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(0);
    });

    it('uses default page size from config when not provided', async () => {
      mockCategoryRepo.findByRestaurantIdPaginated.mockResolvedValue({ data: [], total: 5 });
      const result = await service.findByRestaurantIdPaginated('r1');
      expect(result.meta.limit).toBe(10); // from mock config
    });
  });

  describe('findCategoryAndThrowIfNotFound', () => {
    it('returns category when found', async () => {
      const cat = { id: 'c1', restaurantId: 'r1' };
      mockCategoryRepo.findById.mockResolvedValue(cat);
      expect(await service.findCategoryAndThrowIfNotFound('c1', 'r1')).toEqual(cat);
    });

    it('throws EntityNotFoundException when not found', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);
      await expect(service.findCategoryAndThrowIfNotFound('c999', 'r1')).rejects.toThrow(EntityNotFoundException);
    });
  });
});
