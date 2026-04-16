# Product Categories Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `Category` model to `ProductCategory` (table `product_categories`), add `isDefault` protection, add composite unique index `(restaurantId, name)`, add `check-delete` endpoint, and implement reassignment-based delete with full E2E test coverage.

**Architecture:** Schema-first approach — both Prisma schemas (SQLite dev + PostgreSQL prod) change together, then the repository and service layer adapt, then new controller endpoints and DTOs are added. All operations are scoped by `restaurantId` from the JWT; cross-restaurant isolation is enforced at the repository layer.

**Tech Stack:** NestJS, Prisma (SQLite dev / PostgreSQL prod), supertest E2E tests, Jest unit tests.

---

## File Map

| Action | File |
|---|---|
| Modify | `apps/api-core/prisma/schema.prisma` |
| Modify | `apps/api-core/prisma/schema.postgresql.prisma` |
| Rename + Modify | `apps/api-core/src/products/category.repository.ts` → `product-category.repository.ts` |
| Modify | `apps/api-core/src/products/categories.service.ts` |
| Modify | `apps/api-core/src/products/categories.controller.ts` |
| Modify | `apps/api-core/src/products/dto/create-category.dto.ts` |
| Create | `apps/api-core/src/products/dto/delete-category.dto.ts` |
| Create | `apps/api-core/src/products/dto/check-delete-category-response.dto.ts` |
| Modify | `apps/api-core/src/products/products.module.ts` |
| Modify | `apps/api-core/src/common/exceptions/common.exceptions.ts` |
| Modify | `apps/api-core/src/common/exceptions/index.ts` |
| Modify | `apps/api-core/src/products/categories.service.spec.ts` |
| Create | `apps/api-core/test/categories/categories.e2e-spec.ts` |
| Modify | `apps/api-core/test/products/createProducts.e2e-spec.ts` |
| Modify | `apps/api-core/test/products/listProducts.e2e-spec.ts` |
| Modify | `apps/api-core/test/products.e2e-spec.ts` |
| Modify | `apps/api-core/src/products/category.module.info.md` |

---

### Task 1: Rename schema in both Prisma files

**Files:**
- Modify: `apps/api-core/prisma/schema.prisma`
- Modify: `apps/api-core/prisma/schema.postgresql.prisma`

- [ ] **Step 1: Update SQLite schema (`schema.prisma`)**

Replace the `Category` model and its references:

```prisma
// In model Restaurant — change relation type:
productCategories ProductCategory[]

// Replace the Category model entirely:
model ProductCategory {
  id        String  @id @default(uuid())
  name      String
  isDefault Boolean @default(false)

  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])

  products Product[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([restaurantId, name])
  @@map("product_categories")
}

// In model Product — change relation (keep field name as-is, only type changes):
category   ProductCategory @relation(fields: [categoryId], references: [id])
```

> Note: The `Restaurant` relation field name changes from `categories` to `productCategories`. The `Product` relation field accessor stays `category` (just the type changes to `ProductCategory`). SQLite does not support `@db.*` native type annotations.

- [ ] **Step 2: Update PostgreSQL schema (`schema.postgresql.prisma`)**

Same changes as Step 1, plus `@db.VarChar(255)` on `name`:

```prisma
// In model Restaurant:
productCategories ProductCategory[]

// Replace Category model:
model ProductCategory {
  id        String  @id @default(uuid())
  name      String  @db.VarChar(255)
  isDefault Boolean @default(false)

  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])

  products Product[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([restaurantId, name])
  @@map("product_categories")
}

// In model Product:
category   ProductCategory @relation(fields: [categoryId], references: [id])
```

- [ ] **Step 3: Validate schema compiles**

```bash
cd apps/api-core && npx prisma validate --schema prisma/schema.prisma
cd apps/api-core && npx prisma validate --schema prisma/schema.postgresql.prisma
```

Expected: `The schema at ... is valid 🚀`

- [ ] **Step 4: Push schema to dev DB to verify migration**

```bash
cd apps/api-core && npx prisma db push --schema prisma/schema.prisma --force-reset
```

Expected: No errors, `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/prisma/schema.prisma apps/api-core/prisma/schema.postgresql.prisma
git commit -m "feat(schema): rename Category to ProductCategory with isDefault and unique index"
```

---

### Task 2: Rename repository class and update all Prisma client calls

**Files:**
- Rename + Modify: `apps/api-core/src/products/category.repository.ts` → `product-category.repository.ts`

> After the schema rename, `prisma.category` no longer exists — it is now `prisma.productCategory`. The `Category` type from `@prisma/client` becomes `ProductCategory`.

- [ ] **Step 1: Create `product-category.repository.ts` with full updated content**

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma, ProductCategory } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type TransactionClient = Prisma.TransactionClient;

export interface CreateProductCategoryData {
  name: string;
  restaurantId: string;
  isDefault?: boolean;
}

@Injectable()
export class ProductCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateProductCategoryData,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const client = tx ?? this.prisma;
    return client.productCategory.create({
      data: {
        name: data.name,
        restaurantId: data.restaurantId,
        isDefault: data.isDefault ?? false,
      },
    });
  }

  async findById(
    id: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<ProductCategory | null> {
    const client = tx ?? this.prisma;
    return client.productCategory.findUnique({
      where: { id, restaurantId },
    });
  }

  async findByRestaurantId(restaurantId: string): Promise<ProductCategory[]> {
    return this.prisma.productCategory.findMany({
      where: { restaurantId },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: ProductCategory[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.productCategory.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.productCategory.count({
        where: { restaurantId },
      }),
    ]);
    return { data, total };
  }

  async findByNameAndRestaurant(
    name: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<ProductCategory | null> {
    const client = tx ?? this.prisma;
    return client.productCategory.findFirst({
      where: { name, restaurantId },
    });
  }

  async findOrCreate(
    data: CreateProductCategoryData,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const existing = await this.findByNameAndRestaurant(
      data.name,
      data.restaurantId,
      tx,
    );
    if (existing) return existing;
    return this.create(data, tx);
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Pick<CreateProductCategoryData, 'name'>>,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const client = tx ?? this.prisma;
    return client.productCategory.update({
      where: { id, restaurantId },
      data,
    });
  }

  async delete(
    id: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<ProductCategory> {
    const client = tx ?? this.prisma;
    return client.productCategory.delete({ where: { id, restaurantId } });
  }

  async countProducts(categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: { categoryId },
    });
  }

  async reassignProducts(
    fromCategoryId: string,
    toCategoryId: string,
    restaurantId: string,
    tx?: TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.product.updateMany({
      where: { categoryId: fromCategoryId, restaurantId },
      data: { categoryId: toCategoryId },
    });
    return result.count;
  }
}
```

- [ ] **Step 2: Delete the old file**

```bash
rm apps/api-core/src/products/category.repository.ts
```

- [ ] **Step 3: Verify TypeScript compiles with no errors on the new file**

```bash
cd apps/api-core && npx tsc --noEmit 2>&1 | grep product-category
```

Expected: No output (no errors for that file — there will be errors elsewhere until Task 6).

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/products/product-category.repository.ts
git rm apps/api-core/src/products/category.repository.ts
git commit -m "feat(categories): rename CategoryRepository to ProductCategoryRepository, update Prisma calls"
```

---

### Task 3: Add new domain exceptions

**Files:**
- Modify: `apps/api-core/src/common/exceptions/common.exceptions.ts`
- Modify: `apps/api-core/src/common/exceptions/index.ts`

- [ ] **Step 1: Add two new exceptions to `common.exceptions.ts`**

Append at the end of the file (after `ExternalServiceException`):

```typescript
/**
 * Thrown when attempting to modify or delete a protected default category.
 */
export class DefaultCategoryProtectedException extends BaseException {
  constructor() {
    super(
      'The default category cannot be modified or deleted',
      HttpStatus.FORBIDDEN,
      'DEFAULT_CATEGORY_PROTECTED',
    );
  }
}

/**
 * Thrown when attempting to delete a category that still has products assigned.
 * The client must provide a reassignTo category ID.
 */
export class CategoryHasProductsException extends BaseException {
  constructor(productsCount: number) {
    super(
      `This category has ${productsCount} product(s) assigned. Provide a 'reassignTo' category ID to reassign them before deleting.`,
      HttpStatus.CONFLICT,
      'CATEGORY_HAS_PRODUCTS',
      { productsCount },
    );
  }
}
```

- [ ] **Step 2: Export from `index.ts`**

Add to `apps/api-core/src/common/exceptions/index.ts`:

```typescript
export { DefaultCategoryProtectedException } from './common.exceptions';
export { CategoryHasProductsException } from './common.exceptions';
```

> Verify `index.ts` already exports the other exceptions with the same pattern — add to the existing export list without removing anything.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/common/exceptions/common.exceptions.ts apps/api-core/src/common/exceptions/index.ts
git commit -m "feat(exceptions): add DefaultCategoryProtectedException and CategoryHasProductsException"
```

---

### Task 4: Update service — new behaviors (TDD: write tests first)

**Files:**
- Modify: `apps/api-core/src/products/categories.service.spec.ts` (tests first)
- Modify: `apps/api-core/src/products/categories.service.ts` (implementation second)

- [ ] **Step 1: Replace `categories.service.spec.ts` with updated full content**

```typescript
// apps/api-core/src/products/categories.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { ProductCategoryRepository } from './product-category.repository';
import { productConfig } from './product.config';
import { ProductEventsService } from '../events/products.events';
import {
  EntityNotFoundException,
  DefaultCategoryProtectedException,
  CategoryHasProductsException,
} from '../common/exceptions';

const mockRepo = {
  findByRestaurantId: jest.fn(),
  findByRestaurantIdPaginated: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  countProducts: jest.fn(),
  reassignProducts: jest.fn(),
};

const mockEvents = {
  emitCategoryCreated: jest.fn(),
  emitCategoryUpdated: jest.fn(),
  emitCategoryDeleted: jest.fn(),
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
        { provide: productConfig.KEY, useValue: { maxPageSize: 10 } },
        { provide: ProductEventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
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
      mockRepo.countProducts.mockResolvedValue(3);
      await expect(service.deleteCategory('c1', 'r1', {})).rejects.toThrow(
        CategoryHasProductsException,
      );
    });

    it('deletes directly when no products and not default', async () => {
      const cat = makeCat();
      mockRepo.findById.mockResolvedValue(cat);
      mockRepo.countProducts.mockResolvedValue(0);
      mockRepo.delete.mockResolvedValue(cat);
      const result = await service.deleteCategory('c1', 'r1', {});
      expect(mockRepo.reassignProducts).not.toHaveBeenCalled();
      expect(mockRepo.delete).toHaveBeenCalledWith('c1', 'r1', expect.anything());
      expect(mockEvents.emitCategoryDeleted).toHaveBeenCalledWith('r1');
      expect(result).toEqual(cat);
    });

    it('throws EntityNotFoundException for reassignTo category not found', async () => {
      mockRepo.findById
        .mockResolvedValueOnce(makeCat())        // source category found
        .mockResolvedValueOnce(null);             // target category not found
      mockRepo.countProducts.mockResolvedValue(2);
      await expect(
        service.deleteCategory('c1', 'r1', { reassignTo: 'c-target' }),
      ).rejects.toThrow(EntityNotFoundException);
    });

    it('throws ValidationException when reassignTo equals the category being deleted', async () => {
      mockRepo.findById.mockResolvedValue(makeCat());
      mockRepo.countProducts.mockResolvedValue(2);
      await expect(
        service.deleteCategory('c1', 'r1', { reassignTo: 'c1' }),
      ).rejects.toThrow();
    });

    it('reassigns products and deletes when reassignTo is valid', async () => {
      const source = makeCat({ id: 'c1' });
      const target = makeCat({ id: 'c2', name: 'Drinks' });
      mockRepo.findById
        .mockResolvedValueOnce(source)  // source
        .mockResolvedValueOnce(target); // target
      mockRepo.countProducts.mockResolvedValue(5);
      mockRepo.reassignProducts.mockResolvedValue(5);
      mockRepo.delete.mockResolvedValue(source);

      const result = await service.deleteCategory('c1', 'r1', { reassignTo: 'c2' });

      expect(mockRepo.reassignProducts).toHaveBeenCalledWith('c1', 'c2', 'r1', expect.anything());
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

    it('returns productsCount, isDefault, canDeleteDirectly=true when 0 products and not default', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: false }));
      mockRepo.countProducts.mockResolvedValue(0);
      const result = await service.checkDelete('c1', 'r1');
      expect(result).toEqual({ productsCount: 0, isDefault: false, canDeleteDirectly: true });
    });

    it('returns canDeleteDirectly=false when category has products', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: false }));
      mockRepo.countProducts.mockResolvedValue(4);
      const result = await service.checkDelete('c1', 'r1');
      expect(result).toEqual({ productsCount: 4, isDefault: false, canDeleteDirectly: false });
    });

    it('returns canDeleteDirectly=false when category isDefault', async () => {
      mockRepo.findById.mockResolvedValue(makeCat({ isDefault: true }));
      mockRepo.countProducts.mockResolvedValue(0);
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
```

- [ ] **Step 2: Run tests to verify they fail (expected)**

```bash
cd apps/api-core && npx jest categories.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: Multiple failures — `ProductCategoryRepository` not found, `checkDelete` not a function, etc.

- [ ] **Step 3: Replace `categories.service.ts` with updated implementation**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { ProductCategory } from '@prisma/client';

import { ProductCategoryRepository, CreateProductCategoryData } from './product-category.repository';
import { productConfig } from './product.config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  EntityNotFoundException,
  DefaultCategoryProtectedException,
  CategoryHasProductsException,
  ValidationException,
} from '../common/exceptions';
import { ProductEventsService } from '../events/products.events';

export interface DeleteCategoryOptions {
  reassignTo?: string;
}

export interface CheckDeleteResult {
  productsCount: number;
  isDefault: boolean;
  canDeleteDirectly: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepository: ProductCategoryRepository,
    @Inject(productConfig.KEY)
    private readonly configService: ConfigType<typeof productConfig>,
    private readonly productEventsService: ProductEventsService,
  ) {}

  async findByRestaurantId(restaurantId: string): Promise<ProductCategory[]> {
    return this.categoryRepository.findByRestaurantId(restaurantId);
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<ProductCategory>> {
    const currentPage = page || 1;
    const currentLimit = limit
      ? Math.min(limit, this.configService.maxPageSize)
      : this.configService.maxPageSize;
    const skip = (currentPage - 1) * currentLimit;

    const { data, total } = await this.categoryRepository.findByRestaurantIdPaginated(
      restaurantId,
      skip,
      currentLimit,
    );

    return {
      data,
      meta: {
        total,
        page: currentPage,
        limit: currentLimit,
        totalPages: Math.ceil(total / currentLimit),
      },
    };
  }

  async createCategory(restaurantId: string, name: string): Promise<ProductCategory> {
    const category = await this.categoryRepository.create({ name, restaurantId });
    this.productEventsService.emitCategoryCreated(restaurantId);
    return category;
  }

  async updateCategory(
    id: string,
    restaurantId: string,
    data: Partial<Pick<CreateProductCategoryData, 'name'>>,
  ): Promise<ProductCategory> {
    const category = await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    if (category.isDefault) throw new DefaultCategoryProtectedException();
    const updated = await this.categoryRepository.update(id, restaurantId, data);
    this.productEventsService.emitCategoryUpdated(restaurantId);
    return updated;
  }

  async checkDelete(id: string, restaurantId: string): Promise<CheckDeleteResult> {
    const category = await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    const productsCount = await this.categoryRepository.countProducts(id);
    return {
      productsCount,
      isDefault: category.isDefault,
      canDeleteDirectly: productsCount === 0 && !category.isDefault,
    };
  }

  async deleteCategory(
    id: string,
    restaurantId: string,
    options: DeleteCategoryOptions,
  ): Promise<ProductCategory> {
    const category = await this.findCategoryAndThrowIfNotFound(id, restaurantId);

    if (category.isDefault) throw new DefaultCategoryProtectedException();

    const productsCount = await this.categoryRepository.countProducts(id);

    if (productsCount > 0 && !options.reassignTo) {
      throw new CategoryHasProductsException(productsCount);
    }

    return this.prisma.$transaction(async (tx) => {
      if (productsCount > 0 && options.reassignTo) {
        if (options.reassignTo === id) {
          throw new ValidationException('reassignTo cannot be the same as the category being deleted');
        }
        const targetCategory = await this.categoryRepository.findById(
          options.reassignTo,
          restaurantId,
          tx,
        );
        if (!targetCategory) {
          throw new EntityNotFoundException('ProductCategory', options.reassignTo);
        }
        await this.categoryRepository.reassignProducts(id, options.reassignTo, restaurantId, tx);
      }

      const deleted = await this.categoryRepository.delete(id, restaurantId, tx);
      this.productEventsService.emitCategoryDeleted(restaurantId);
      return deleted;
    });
  }

  async findCategoryAndThrowIfNotFound(id: string, restaurantId: string): Promise<ProductCategory> {
    const category = await this.categoryRepository.findById(id, restaurantId);
    if (!category) throw new EntityNotFoundException('ProductCategory', id);
    return category;
  }
}
```

> **Note:** `this.prisma.$transaction` requires injecting `PrismaService`. Add it to the constructor and the providers. See Step 4.

- [ ] **Step 4: Inject PrismaService into CategoriesService for transactions**

Add to constructor:

```typescript
import { PrismaService } from '../prisma/prisma.service';

constructor(
  private readonly categoryRepository: ProductCategoryRepository,
  @Inject(productConfig.KEY)
  private readonly configService: ConfigType<typeof productConfig>,
  private readonly productEventsService: ProductEventsService,
  private readonly prisma: PrismaService,
) {}
```

And in `products.module.ts` make sure `PrismaService` is available (it should be from the global Prisma module — verify it is, if not add `PrismaModule` to imports).

- [ ] **Step 5: Run unit tests — verify they pass**

```bash
cd apps/api-core && npx jest categories.service.spec.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/products/categories.service.ts apps/api-core/src/products/categories.service.spec.ts
git commit -m "feat(categories): add isDefault protection, checkDelete, and reassignment delete"
```

---

### Task 5: Update DTOs and Controller

**Files:**
- Modify: `apps/api-core/src/products/dto/create-category.dto.ts`
- Create: `apps/api-core/src/products/dto/delete-category.dto.ts`
- Create: `apps/api-core/src/products/dto/check-delete-category-response.dto.ts`
- Modify: `apps/api-core/src/products/categories.controller.ts`

- [ ] **Step 1: Create `delete-category.dto.ts`**

```typescript
import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteCategoryDto {
  @ApiPropertyOptional({
    description: 'ID of the category to reassign products to before deleting',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  reassignTo?: string;
}
```

- [ ] **Step 2: Create `check-delete-category-response.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CheckDeleteCategoryResponseDto {
  @ApiProperty({ description: 'Number of products assigned to this category' })
  productsCount: number;

  @ApiProperty({ description: 'Whether this is the restaurant default category' })
  isDefault: boolean;

  @ApiProperty({
    description: 'True when productsCount is 0 and category is not default — delete requires no extra steps',
  })
  canDeleteDirectly: boolean;
}
```

- [ ] **Step 3: Replace `categories.controller.ts` with full updated content**

```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';

import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { DeleteCategoryDto } from './dto/delete-category.dto';
import { CheckDeleteCategoryResponseDto } from './dto/check-delete-category-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedCategoriesResponseDto } from './dto/paginated-categories-response.dto';
import { CategoryDto } from './dto/category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller({ version: '1', path: 'categories' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar categorías (paginado)' })
  @ApiResponse({ status: 200, type: PaginatedCategoriesResponseDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    return this.categoriesService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Crear una categoría' })
  @ApiResponse({ status: 201, type: CategoryDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  @ApiResponse({ status: 409, description: 'Nombre duplicado en el restaurante' })
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.createCategory(user.restaurantId, dto.name);
  }

  @Get(':id/check-delete')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Verificar impacto de eliminar una categoría' })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiResponse({ status: 200, type: CheckDeleteCategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async checkDelete(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.categoriesService.checkDelete(id, user.restaurantId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Actualizar una categoría' })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiResponse({ status: 200, type: CategoryDto })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin permisos o categoría default' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.updateCategory(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Eliminar una categoría (con reasignación opcional)' })
  @ApiParam({ name: 'id', description: 'ID de la categoría', type: String })
  @ApiBody({ type: DeleteCategoryDto, required: false })
  @ApiResponse({ status: 200, type: CategoryDto })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 403, description: 'Categoría default protegida' })
  @ApiResponse({ status: 409, description: 'Tiene productos — requiere reassignTo' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: DeleteCategoryDto,
  ) {
    return this.categoriesService.deleteCategory(id, user.restaurantId, {
      reassignTo: dto?.reassignTo,
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add \
  apps/api-core/src/products/dto/delete-category.dto.ts \
  apps/api-core/src/products/dto/check-delete-category-response.dto.ts \
  apps/api-core/src/products/categories.controller.ts
git commit -m "feat(categories): add check-delete endpoint and reassignTo body on DELETE"
```

---

### Task 6: Update `products.module.ts`

**Files:**
- Modify: `apps/api-core/src/products/products.module.ts`

- [ ] **Step 1: Update module to use `ProductCategoryRepository`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProductRepository } from './product.repository';
import { ProductsService } from './products.service';

import { ProductCategoryRepository } from './product-category.repository';
import { CategoriesService } from './categories.service';

import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';

import { EventsModule } from '../events/events.module';
import { productConfig } from './product.config';

@Module({
  imports: [ConfigModule.forFeature(productConfig), EventsModule],
  controllers: [ProductsController, CategoriesController],
  providers: [
    ProductRepository,
    ProductCategoryRepository,
    ProductsService,
    CategoriesService,
  ],
  exports: [
    ProductsService,
    CategoriesService,
    ProductRepository,
    ProductCategoryRepository,
  ],
})
export class ProductsModule {}
```

- [ ] **Step 2: Check if PrismaService needs to be explicitly provided**

```bash
cd apps/api-core && grep -r "PrismaModule\|PrismaService" src/app.module.ts src/prisma/ | head -10
```

If `PrismaService` is provided globally (via a `@Global()` module), no change needed. If not, add `PrismaModule` to the imports of `ProductsModule`.

- [ ] **Step 3: Verify full TypeScript compilation**

```bash
cd apps/api-core && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/products/products.module.ts
git commit -m "chore(products): update module to use ProductCategoryRepository"
```

---

### Task 7: Fix cross-references in existing test files

> After the schema rename, `prisma.category` no longer exists. Three existing E2E test files create seed categories using `prisma.category.create` — they must be updated to `prisma.productCategory.create`. Also, seed data must include `isDefault: false` explicitly, since these are user-created test categories.

**Files:**
- Modify: `apps/api-core/test/products/createProducts.e2e-spec.ts`
- Modify: `apps/api-core/test/products/listProducts.e2e-spec.ts`
- Modify: `apps/api-core/test/products.e2e-spec.ts`

- [ ] **Step 1: Update `createProducts.e2e-spec.ts`**

Find line:
```typescript
const category = await prisma.category.create({
  data: { name: 'General', restaurantId: restaurant.id },
});
```

Replace with:
```typescript
const category = await prisma.productCategory.create({
  data: { name: 'General', restaurantId: restaurant.id, isDefault: false },
});
```

- [ ] **Step 2: Update `listProducts.e2e-spec.ts`**

Apply the same replacement (find `prisma.category.create` and update to `prisma.productCategory.create` with `isDefault: false`).

- [ ] **Step 3: Update `products.e2e-spec.ts`**

Apply the same replacement.

- [ ] **Step 4: Run existing product E2E tests to confirm they still pass**

```bash
cd apps/api-core && npx jest test/products/createProducts.e2e-spec.ts --no-coverage 2>&1 | tail -10
cd apps/api-core && npx jest test/products/listProducts.e2e-spec.ts --no-coverage 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api-core/test/products/createProducts.e2e-spec.ts \
  apps/api-core/test/products/listProducts.e2e-spec.ts \
  apps/api-core/test/products.e2e-spec.ts
git commit -m "fix(tests): update seed helpers to use productCategory after schema rename"
```

---

### Task 8: Write E2E tests for the categories module

**Files:**
- Create: `apps/api-core/test/categories/categories.e2e-spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
/**
 * E2E: Categories CRUD — /v1/categories
 *
 * Cases covered:
 *  GET    /v1/categories               — list paginated, role guard, isolation
 *  POST   /v1/categories               — create, role guard, DTO validation, duplicate name
 *  GET    /v1/categories/:id/check-delete — check impact before delete
 *  PATCH  /v1/categories/:id           — update, role guard, default protection, isolation
 *  DELETE /v1/categories/:id           — delete direct, reassignment, default protection, isolation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_DB = path.resolve(__dirname, 'test-categories.db');

async function bootstrapApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  process.env.DATABASE_URL = `file:${TEST_DB}`;

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: { name: `RestCat ${suffix} ${Date.now()}`, slug: `rest-cat-${suffix}-${Date.now()}` },
  });

  const defaultCategory = await prisma.productCategory.create({
    data: { name: 'Sin categoría', restaurantId: restaurant.id, isDefault: true },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `admin-cat-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: `manager-cat-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'MANAGER',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const basic = await prisma.user.create({
    data: {
      email: `basic-cat-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'BASIC',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, defaultCategory, admin, manager, basic };
}

async function login(app: INestApplication<App>, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect((r) => {
      if (r.status !== 200 && r.status !== 201)
        throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
  return res.body.accessToken as string;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Restaurant A
  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let defaultCategoryIdA: string;
  let restaurantAId: string;

  // Restaurant B
  let adminTokenB: string;
  let restaurantBId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const seedA = await seedRestaurant(prisma, 'A');
    restaurantAId = seedA.restaurant.id;
    defaultCategoryIdA = seedA.defaultCategory.id;
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);

    const seedB = await seedRestaurant(prisma, 'B');
    restaurantBId = seedB.restaurant.id;
    adminTokenB = await login(app, seedB.admin.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  // ── GET /v1/categories ─────────────────────────────────────────────────────

  describe('GET /v1/categories', () => {
    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer()).get('/v1/categories').expect(401);
    });

    it('200 — BASIC can list categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/categories')
        .set('Authorization', `Bearer ${basicTokenA}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('200 — only returns categories of the authenticated restaurant', async () => {
      const resA = await request(app.getHttpServer())
        .get('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(200);

      const idsA = resA.body.data.map((c: { id: string }) => c.id);
      const idsB = resB.body.data.map((c: { id: string }) => c.id);

      idsA.forEach((id: string) => expect(idsB).not.toContain(id));
      idsB.forEach((id: string) => expect(idsA).not.toContain(id));
    });

    it('200 — pagination meta is correct', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/categories?page=1&limit=5')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
    });
  });

  // ── POST /v1/categories ────────────────────────────────────────────────────

  describe('POST /v1/categories', () => {
    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .send({ name: 'Test' })
        .expect(401);
    });

    it('403 — BASIC cannot create a category', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${basicTokenA}`)
        .send({ name: 'Test BASIC' })
        .expect(403);
    });

    it('400 — empty name is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: '' })
        .expect(400);
    });

    it('400 — name longer than 255 characters is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'A'.repeat(256) })
        .expect(400);
    });

    it('201 — ADMIN can create a category', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Bebidas' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Bebidas');
      expect(res.body.restaurantId).toBe(restaurantAId);
      expect(res.body.isDefault).toBe(false);
    });

    it('201 — MANAGER can create a category', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ name: 'Postres' })
        .expect(201);

      expect(res.body.id).toBeDefined();
    });

    it('409 — duplicate name in the same restaurant is rejected', async () => {
      // Create the category first
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Duplicada' })
        .expect(201);

      // Try again with the same name
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Duplicada' })
        .expect(409);

      expect(res.body.code).toBeDefined();
    });

    it('201 — same name in different restaurants is allowed', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Compartida' })
        .expect(201);

      // Same name in restaurant B — must succeed
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenB}`)
        .send({ name: 'Compartida' })
        .expect(201);
    });
  });

  // ── GET /v1/categories/:id/check-delete ────────────────────────────────────

  describe('GET /v1/categories/:id/check-delete', () => {
    let checkCatId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Para Chequear' })
        .expect(201);
      checkCatId = res.body.id;
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .expect(401);
    });

    it('403 — BASIC cannot check delete', async () => {
      await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .expect(403);
    });

    it('404 — category not found returns 404', async () => {
      await request(app.getHttpServer())
        .get('/v1/categories/00000000-0000-0000-0000-000000000000/check-delete')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(404);
    });

    it('404 — restaurant B cannot check category from restaurant A', async () => {
      await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(404);
    });

    it('200 — returns correct result for category with no products', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.productsCount).toBe(0);
      expect(res.body.isDefault).toBe(false);
      expect(res.body.canDeleteDirectly).toBe(true);
    });

    it('200 — returns canDeleteDirectly=false for default category', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/categories/${defaultCategoryIdA}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.isDefault).toBe(true);
      expect(res.body.canDeleteDirectly).toBe(false);
    });

    it('200 — returns correct productsCount when category has products', async () => {
      // Create a product assigned to checkCatId
      await prisma.product.create({
        data: {
          name: 'Producto Chequeo',
          price: 500n,
          restaurantId: restaurantAId,
          categoryId: checkCatId,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/categories/${checkCatId}/check-delete`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(200);

      expect(res.body.productsCount).toBe(1);
      expect(res.body.canDeleteDirectly).toBe(false);

      // Clean up — move product away so later delete tests work
      await prisma.product.updateMany({
        where: { categoryId: checkCatId },
        data: { categoryId: defaultCategoryIdA },
      });
    });
  });

  // ── PATCH /v1/categories/:id ───────────────────────────────────────────────

  describe('PATCH /v1/categories/:id', () => {
    let patchCatId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Para Editar' })
        .expect(201);
      patchCatId = res.body.id;
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .send({ name: 'X' })
        .expect(401);
    });

    it('403 — BASIC cannot update a category', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .send({ name: 'X' })
        .expect(403);
    });

    it('404 — category not found returns 404', async () => {
      await request(app.getHttpServer())
        .patch('/v1/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'X' })
        .expect(404);
    });

    it('404 — restaurant B cannot update category from restaurant A', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .send({ name: 'Hack' })
        .expect(404);
    });

    it('403 DEFAULT_CATEGORY_PROTECTED — cannot update the default category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/categories/${defaultCategoryIdA}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Nuevo Nombre Default' })
        .expect(403);

      expect(res.body.code).toBe('DEFAULT_CATEGORY_PROTECTED');
    });

    it('400 — name longer than 255 characters is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'A'.repeat(256) })
        .expect(400);
    });

    it('200 — ADMIN can update a category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Nombre Actualizado' })
        .expect(200);

      expect(res.body.name).toBe('Nombre Actualizado');
    });

    it('200 — MANAGER can update a category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/categories/${patchCatId}`)
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ name: 'Nombre Manager' })
        .expect(200);

      expect(res.body.name).toBe('Nombre Manager');
    });
  });

  // ── DELETE /v1/categories/:id ──────────────────────────────────────────────

  describe('DELETE /v1/categories/:id', () => {
    let deleteCatId: string;
    let catWithProductsId: string;
    let reassignTargetId: string;

    beforeAll(async () => {
      // Empty category — direct delete
      const resEmpty = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Para Eliminar Directo' })
        .expect(201);
      deleteCatId = resEmpty.body.id;

      // Category with product
      const resWith = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Con Productos' })
        .expect(201);
      catWithProductsId = resWith.body.id;

      await prisma.product.create({
        data: {
          name: 'Producto para reasignar',
          price: 1000n,
          restaurantId: restaurantAId,
          categoryId: catWithProductsId,
        },
      });

      // Reassignment target
      const resTarget = await request(app.getHttpServer())
        .post('/v1/categories')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: 'Destino Reasignacion' })
        .expect(201);
      reassignTargetId = resTarget.body.id;
    });

    it('401 — unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .expect(401);
    });

    it('403 — BASIC cannot delete a category', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .set('Authorization', `Bearer ${basicTokenA}`)
        .expect(403);
    });

    it('404 — category not found returns 404', async () => {
      await request(app.getHttpServer())
        .delete('/v1/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(404);
    });

    it('404 — restaurant B cannot delete category from restaurant A', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .set('Authorization', `Bearer ${adminTokenB}`)
        .expect(404);
    });

    it('403 DEFAULT_CATEGORY_PROTECTED — cannot delete the default category', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${defaultCategoryIdA}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .expect(403);

      expect(res.body.code).toBe('DEFAULT_CATEGORY_PROTECTED');
    });

    it('409 CATEGORY_HAS_PRODUCTS — delete without reassignTo when products exist', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({})
        .expect(409);

      expect(res.body.code).toBe('CATEGORY_HAS_PRODUCTS');
      expect(res.body.details.productsCount).toBe(1);
    });

    it('404 — reassignTo category not found or from another restaurant', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: '00000000-0000-0000-0000-000000000000' })
        .expect(404);

      expect(res.body.code).toBe('ENTITY_NOT_FOUND');
    });

    it('404 — reassignTo from restaurant B is rejected (cross-restaurant isolation)', async () => {
      // Get a category from restaurant B
      const catB = await prisma.productCategory.findFirst({
        where: { restaurantId: restaurantBId },
      });

      const res = await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: catB!.id })
        .expect(404);

      expect(res.body.code).toBe('ENTITY_NOT_FOUND');
    });

    it('400 — reassignTo same as the category being deleted', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: catWithProductsId })
        .expect(400);
    });

    it('200 — delete with reassignTo moves products and deletes category', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/${catWithProductsId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ reassignTo: reassignTargetId })
        .expect(200);

      // Category is gone
      const gone = await prisma.productCategory.findUnique({ where: { id: catWithProductsId } });
      expect(gone).toBeNull();

      // Products moved to target
      const products = await prisma.product.findMany({ where: { categoryId: catWithProductsId } });
      expect(products).toHaveLength(0);

      const reassigned = await prisma.product.findMany({ where: { categoryId: reassignTargetId } });
      expect(reassigned.length).toBeGreaterThan(0);
    });

    it('200 — ADMIN can delete a category with no products directly', async () => {
      const deleted = await request(app.getHttpServer())
        .delete(`/v1/categories/${deleteCatId}`)
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({})
        .expect(200);

      expect(deleted.body.id).toBe(deleteCatId);

      const gone = await prisma.productCategory.findUnique({ where: { id: deleteCatId } });
      expect(gone).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the E2E test suite**

```bash
cd apps/api-core && npx jest test/categories/categories.e2e-spec.ts --no-coverage --runInBand 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/categories/categories.e2e-spec.ts
git commit -m "test(categories): add full E2E test suite with isolation, default protection, and reassignment"
```

---

### Task 9: Update the module documentation

**Files:**
- Modify: `apps/api-core/src/products/category.module.info.md`

- [ ] **Step 1: Replace with updated content**

```markdown
### ProductCategory (product_categories)

### Endpoints

| Método | Ruta | Roles permitidos | Descripción |
|---|---|---|---|
| `GET` | `/v1/categories` | ADMIN, MANAGER, BASIC | Lista paginada de categorías del restaurante |
| `POST` | `/v1/categories` | ADMIN, MANAGER | Crear una categoría |
| `GET` | `/v1/categories/:id/check-delete` | ADMIN, MANAGER | Verificar impacto antes de eliminar |
| `PATCH` | `/v1/categories/:id` | ADMIN, MANAGER | Actualizar nombre (bloquea si isDefault) |
| `DELETE` | `/v1/categories/:id` | ADMIN, MANAGER | Eliminar (bloquea default, requiere reassignTo si tiene productos) |

---

#### List — `GET /v1/categories`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC puede listar | 200 | Retorna `{ data, meta }` paginado |
| Solo devuelve categorías del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |
| Con `?page=1&limit=5` | 200 | Meta correcta |

---

#### Create — `POST /v1/categories`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta crear | 403 | Solo ADMIN o MANAGER |
| `name` vacío | 400 | `@IsNotEmpty()` en DTO |
| `name` mayor a 255 caracteres | 400 | `@MaxLength(255)` en DTO |
| ADMIN crea categoría válida | 201 | Retorna categoría, emite `categoryCreated` |
| MANAGER crea categoría válida | 201 | Retorna categoría, emite `categoryCreated` |
| Nombre duplicado en el mismo restaurante | 409 | Constraint `@@unique([restaurantId, name])` en BD |
| Mismo nombre en diferente restaurante | 201 | Permitido — el índice único es compuesto |

---

#### Check Delete — `GET /v1/categories/:id/check-delete`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta chequear | 403 | Solo ADMIN o MANAGER |
| Categoría no existe | 404 | `EntityNotFoundException` |
| Categoría de otro restaurante | 404 | Aislamiento — no se encuentra |
| Categoría sin productos, no default | 200 | `{ productsCount: 0, isDefault: false, canDeleteDirectly: true }` |
| Categoría con productos | 200 | `{ productsCount: N, canDeleteDirectly: false }` |
| Categoría default | 200 | `{ isDefault: true, canDeleteDirectly: false }` |

---

#### Update — `PATCH /v1/categories/:id`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta actualizar | 403 | Solo ADMIN o MANAGER |
| Categoría no existe | 404 | `EntityNotFoundException` |
| Categoría de otro restaurante | 404 | Aislamiento — no se encuentra |
| `isDefault: true` | 403 | `DEFAULT_CATEGORY_PROTECTED` — no se puede renombrar la default |
| `name` mayor a 255 caracteres | 400 | `@MaxLength(255)` en DTO |
| ADMIN actualiza | 200 | Retorna categoría actualizada, emite `categoryUpdated` |
| MANAGER actualiza | 200 | Retorna categoría actualizada |

---

#### Delete — `DELETE /v1/categories/:id`

Body: `{ reassignTo?: string }` (UUID opcional)

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta eliminar | 403 | Solo ADMIN o MANAGER |
| Categoría no existe | 404 | `EntityNotFoundException` |
| Categoría de otro restaurante | 404 | Aislamiento — no se encuentra |
| `isDefault: true` | 403 | `DEFAULT_CATEGORY_PROTECTED` |
| Tiene productos y no viene `reassignTo` | 409 | `CATEGORY_HAS_PRODUCTS` con `details.productsCount` |
| `reassignTo` no existe o es de otro restaurante | 404 | `EntityNotFoundException` |
| `reassignTo` es la misma categoría | 400 | `VALIDATION_ERROR` |
| Tiene productos y `reassignTo` válido | 200 | Reasigna productos y elimina en transacción |
| Sin productos | 200 | Elimina directamente |

---

### Notas de implementación

- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- `isDefault: true` se asigna al crear el restaurante; esa categoría no puede ser editada ni eliminada
- El índice `@@unique([restaurantId, name])` evita nombres duplicados dentro del mismo restaurante pero permite el mismo nombre entre restaurantes distintos
- El delete con reassignment ocurre en una transacción Prisma para garantizar atomicidad
- PostgreSQL: `name` tiene `@db.VarChar(255)`; SQLite: solo `String` (sin anotaciones nativas)
- `ProductCategoryRepository.countProducts` y `reassignProducts` acceden a la tabla `product` (no `product_categories`)

### Tests existentes

| Tipo | Archivo | Estado |
|---|---|---|
| Unit (service) | `src/products/categories.service.spec.ts` | ✅ |
| E2E | `test/categories/categories.e2e-spec.ts` | ✅ |
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/products/category.module.info.md
git commit -m "docs(categories): update module info to reflect ProductCategory refactor"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| Rename table to `product_categories` | Task 1 + 2 |
| `isDefault` field — block edit/delete on default category | Task 1 (schema), Task 3 (exceptions), Task 4 (service) |
| Composite unique index `(restaurantId, name)` in both schemas | Task 1 |
| PostgreSQL `VarChar(255)` on name | Task 1 |
| `check-delete` endpoint returning `productsCount` | Task 4 (service), Task 5 (controller) |
| DELETE requires `reassignTo` when products exist | Task 4 (service), Task 5 (controller) |
| Reassignment validates target exists and belongs to same restaurant | Task 4 (service) |
| All operations scoped by `restaurantId` from JWT | Enforced throughout (findById always uses restaurantId) |
| E2E tests for all cases | Task 8 |
| Update existing tests that use `prisma.category` | Task 7 |
| Update documentation | Task 9 |

### Type consistency check

- `ProductCategoryRepository` defined in Task 2, imported in Tasks 4, 5, 6
- `DeleteCategoryOptions` interface defined in Task 4 service, used in Task 4 spec and Task 5 controller
- `CheckDeleteResult` defined in Task 4 service, response type used in Task 5 `CheckDeleteCategoryResponseDto`
- `DefaultCategoryProtectedException` defined in Task 3, imported in Task 4
- `CategoryHasProductsException` defined in Task 3, imported in Task 4
- `prisma.productCategory.*` used throughout Task 2, Task 7, Task 8 ✓
