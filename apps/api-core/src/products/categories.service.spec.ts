// apps/api-core/src/products/categories.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { ProductCategoryRepository } from './product-category.repository';
import { ProductRepository } from './product.repository';
import { productConfig } from './product.config';
import { ProductEventsService } from '../events/products.events';
import {
  EntityNotFoundException,
  DefaultCategoryProtectedException,
  CategoryHasProductsException,
  ValidationException,
} from '../common/exceptions';
import { PrismaService } from '../prisma/prisma.service';

const mockRepo = {
  findByRestaurantId: jest.fn(),
  findByRestaurantIdPaginated: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockProductRepo = {
  countByCategoryId: jest.fn(),
  reassignCategory: jest.fn(),
};

const mockEvents = {
  emitCategoryCreated: jest.fn(),
  emitCategoryUpdated: jest.fn(),
  emitCategoryDeleted: jest.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(mockPrisma)),
};

const makeCat = (overrides = {}) => ({
  id: 'c1',
  name: 'Burgers',
  restaurantId: 'r1',
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: ProductCategoryRepository, useValue: mockRepo },
        { provide: ProductRepository, useValue: mockProductRepo },
        { provide: productConfig.KEY, useValue: { maxPageSize: 10 } },
        { provide: ProductEventsService, useValue: mockEvents },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
  });

  // ── createCategory ──────────────────────────────────────────────────────────

  describe('createCategory', () => {
    it('creates category and emits event', async () => {
      const cat = makeCat();
      mockRepo.create.mockResolvedValue(cat);
      const result = await service.createCategory('r1', 'Burgers');
      expect(mockRepo.create).toHaveBeenCalledWith({ name: 'Burgers', restaurantId: 'r1' });
      expect(mockEvents.emitCategoryCreated).toHaveBeenCalledWith('r1');
      expect(result).toEqual(cat);
    });
  });

  // ── updateCategory ──────────────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('throws EntityNotFoundException when category not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.updateCategory('c999', 'r1', { name: 'X' })).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it('throws DefaultCategoryProtectedException when category isDefault', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: true }));
      await expect(service.updateCategory('c1', 'r1', { name: 'X' })).rejects.toThrow(
        DefaultCategoryProtectedException,
      );
    });

    it('updates category and emits event', async () => {
      const cat = makeCat();
      mockRepo.findById.mockResolvedValue(cat);
      mockRepo.update.mockResolvedValue({ ...cat, name: 'Updated' });
      const result = await service.updateCategory('c1', 'r1', { name: 'Updated' });
      expect(mockRepo.update).toHaveBeenCalledWith('c1', 'r1', { name: 'Updated' });
      expect(mockEvents.emitCategoryUpdated).toHaveBeenCalledWith('r1');
      expect(result.name).toBe('Updated');
    });
  });

  // ── deleteCategory ──────────────────────────────────────────────────────────

  describe('deleteCategory', () => {
    it('throws EntityNotFoundException when category not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.deleteCategory('c999', 'r1', {})).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it('throws DefaultCategoryProtectedException when category isDefault', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: true }));
      await expect(service.deleteCategory('c1', 'r1', {})).rejects.toThrow(
        DefaultCategoryProtectedException,
      );
    });

    it('throws CategoryHasProductsException when products exist and no reassignTo', async () => {
      mockRepo.findById.mockResolvedValue(makeCat());
      mockProductRepo.countByCategoryId.mockResolvedValue(3);
      await expect(service.deleteCategory('c1', 'r1', {})).rejects.toThrow(
        CategoryHasProductsException,
      );
    });

    it('deletes directly when no products and not default', async () => {
      const cat = makeCat();
      mockRepo.findById.mockResolvedValue(cat);
      mockProductRepo.countByCategoryId.mockResolvedValue(0);
      mockRepo.delete.mockResolvedValue(cat);
      const result = await service.deleteCategory('c1', 'r1', {});
      expect(mockProductRepo.reassignCategory).not.toHaveBeenCalled();
      expect(mockRepo.delete).toHaveBeenCalledWith('c1', 'r1', expect.anything());
      expect(mockEvents.emitCategoryDeleted).toHaveBeenCalledWith('r1');
      expect(result).toEqual(cat);
    });

    it('throws EntityNotFoundException for reassignTo category not found', async () => {
      // Target check fires before countProducts
      mockRepo.findById
        .mockResolvedValueOnce(makeCat())   // source found
        .mockResolvedValueOnce(null);        // target not found
      await expect(
        service.deleteCategory('c1', 'r1', { reassignTo: 'c-target' }),
      ).rejects.toThrow(EntityNotFoundException);
    });

    it('throws ValidationException when reassignTo equals the category being deleted', async () => {
      // Validation fires before countProducts — no need to mock countByCategoryId
      mockRepo.findById.mockResolvedValue(makeCat());
      await expect(
        service.deleteCategory('c1', 'r1', { reassignTo: 'c1' }),
      ).rejects.toThrow(ValidationException);
    });

    it('reassigns products and deletes when reassignTo is valid', async () => {
      const source = makeCat({ id: 'c1' });
      const target = makeCat({ id: 'c2', name: 'Drinks' });
      mockRepo.findById
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      mockProductRepo.countByCategoryId.mockResolvedValue(5);
      mockProductRepo.reassignCategory.mockResolvedValue(5);
      mockRepo.delete.mockResolvedValue(source);

      const result = await service.deleteCategory('c1', 'r1', { reassignTo: 'c2' });

      expect(mockProductRepo.reassignCategory).toHaveBeenCalledWith('c1', 'c2', 'r1', expect.anything());
      expect(mockRepo.delete).toHaveBeenCalledWith('c1', 'r1', expect.anything());
      expect(mockEvents.emitCategoryDeleted).toHaveBeenCalledWith('r1');
      expect(result).toEqual(source);
    });
  });

  // ── checkDelete ─────────────────────────────────────────────────────────────

  describe('checkDelete', () => {
    it('throws EntityNotFoundException when category not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.checkDelete('c999', 'r1')).rejects.toThrow(EntityNotFoundException);
    });

    it('returns canDeleteDirectly=true when 0 products and not default', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: false }));
      mockProductRepo.countByCategoryId.mockResolvedValue(0);
      const result = await service.checkDelete('c1', 'r1');
      expect(result).toEqual({ productsCount: 0, isDefault: false, canDeleteDirectly: true });
    });

    it('returns canDeleteDirectly=false when category has products', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: false }));
      mockProductRepo.countByCategoryId.mockResolvedValue(4);
      const result = await service.checkDelete('c1', 'r1');
      expect(result).toEqual({ productsCount: 4, isDefault: false, canDeleteDirectly: false });
    });

    it('returns canDeleteDirectly=false when category isDefault', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: true }));
      mockProductRepo.countByCategoryId.mockResolvedValue(0);
      const result = await service.checkDelete('c1', 'r1');
      expect(result).toEqual({ productsCount: 0, isDefault: true, canDeleteDirectly: false });
    });
  });

  // ── findByRestaurantIdPaginated ─────────────────────────────────────────────

  describe('findByRestaurantIdPaginated', () => {
    it('returns paginated result with correct meta', async () => {
      mockRepo.findByRestaurantIdPaginated.mockResolvedValue({ data: [], total: 0 });
      const result = await service.findByRestaurantIdPaginated('r1', 1, 10);
      expect(result.meta).toEqual({ total: 0, page: 1, limit: 10, totalPages: 0 });
    });

    it('uses default page size from config when not provided', async () => {
      mockRepo.findByRestaurantIdPaginated.mockResolvedValue({ data: [], total: 5 });
      const result = await service.findByRestaurantIdPaginated('r1');
      expect(result.meta.limit).toBe(10);
    });
  });

  // ── findCategoryAndThrowIfNotFound ──────────────────────────────────────────

  describe('findCategoryAndThrowIfNotFound', () => {
    it('returns category when found', async () => {
      const cat = makeCat();
      mockRepo.findById.mockResolvedValue(cat);
      expect(await service.findCategoryAndThrowIfNotFound('c1', 'r1')).toEqual(cat);
    });

    it('throws EntityNotFoundException when not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findCategoryAndThrowIfNotFound('c999', 'r1')).rejects.toThrow(
        EntityNotFoundException,
      );
    });
  });
});
