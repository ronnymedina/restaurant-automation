# Refactor General de Módulos — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactorizar los módulos products, orders, kiosk y restaurants aplicando centralización de eventos, guard de ownership, constantes tipadas, return types explícitos en controllers, y ≥80% de cobertura de tests.

**Architecture:** Los eventos WebSocket se centralizan en `src/events/` con servicios por módulo e inyección estándar (sin `@Optional()`). Un guard NestJS genérico (`RestaurantResourceGuard`) valida ownership usando metadatos del handler + PrismaService dinámico para eliminar el patrón `findXAndThrowIfNotFound` en update/delete.

**Tech Stack:** NestJS 11, Prisma 7, Jest 30, @nestjs/swagger 11, TypeScript 5.7

---

## Task 1: Centralizar eventos en `src/events/`

**Files:**
- Create: `apps/api-core/src/events/products.events.ts`
- Create: `apps/api-core/src/events/orders.events.ts`
- Create: `apps/api-core/src/events/kiosk.events.ts`
- Modify: `apps/api-core/src/events/events.module.ts`

**Step 1: Crear `products.events.ts`**

```ts
// apps/api-core/src/events/products.events.ts
import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export const PRODUCT_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

export const CATEGORY_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

@Injectable()
export class ProductEventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitProductCreated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: 'product',
      action: 'created',
    });
  }

  emitProductUpdated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: 'product',
      action: 'updated',
    });
  }

  emitProductDeleted(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: 'product',
      action: 'deleted',
    });
  }

  emitCategoryCreated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: 'category',
      action: 'created',
    });
  }

  emitCategoryUpdated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: 'category',
      action: 'updated',
    });
  }

  emitCategoryDeleted(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: 'category',
      action: 'deleted',
    });
  }
}
```

**Step 2: Crear `orders.events.ts`**

```ts
// apps/api-core/src/events/orders.events.ts
import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { EventsGateway } from './events.gateway';

export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

@Injectable()
export class OrderEventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitOrderCreated(restaurantId: string, order: Order): void {
    this.gateway.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, { order });
  }

  emitOrderUpdated(restaurantId: string, order: Order): void {
    this.gateway.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, { order });
  }
}
```

**Step 3: Crear `kiosk.events.ts`**

```ts
// apps/api-core/src/events/kiosk.events.ts
import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export const KIOSK_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

export const STOCK_STATUS = {
  AVAILABLE: 'available',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
} as const;

export type StockStatus = (typeof STOCK_STATUS)[keyof typeof STOCK_STATUS];

@Injectable()
export class KioskEventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitCatalogChanged(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, KIOSK_EVENTS.CATALOG_CHANGED, {});
  }
}
```

**Step 4: Actualizar `events.module.ts` para exportar los nuevos servicios**

```ts
// apps/api-core/src/events/events.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { EventsGateway } from './events.gateway';
import { ProductEventsService } from './products.events';
import { OrderEventsService } from './orders.events';
import { KioskEventsService } from './kiosk.events';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { JWT_SECRET } from '../config';

@Module({
  imports: [
    JwtModule.register({ secret: JWT_SECRET }),
    RestaurantsModule,
  ],
  providers: [EventsGateway, ProductEventsService, OrderEventsService, KioskEventsService],
  exports: [EventsGateway, ProductEventsService, OrderEventsService, KioskEventsService],
})
export class EventsModule {}
```

**Step 5: Commit**

```bash
git add apps/api-core/src/events/
git commit -m "feat: centralize module events in events/ with typed constants"
```

---

## Task 2: Crear `RestaurantResourceGuard` en `src/common/guards/`

**Files:**
- Create: `apps/api-core/src/common/guards/restaurant-resource.guard.ts`
- Create: `apps/api-core/src/common/guards/restaurant-resource.guard.spec.ts`

**Step 1: Escribir el test primero**

```ts
// apps/api-core/src/common/guards/restaurant-resource.guard.spec.ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RestaurantResourceGuard, RESOURCE_MODEL_KEY } from './restaurant-resource.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../exceptions';

const mockPrisma = {
  category: {
    findFirst: jest.fn(),
  },
};

const buildContext = (params: Record<string, string>, user: object, handlerMetadata?: string): ExecutionContext => ({
  switchToHttp: () => ({
    getRequest: () => ({ params, user }),
  }),
  getHandler: () => ({}),
  getClass: () => ({}),
} as unknown as ExecutionContext);

describe('RestaurantResourceGuard', () => {
  let guard: RestaurantResourceGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RestaurantResourceGuard,
        { provide: PrismaService, useValue: mockPrisma },
        Reflector,
      ],
    }).compile();

    guard = module.get(RestaurantResourceGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('returns true when no model metadata (guard not applied)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const ctx = buildContext({ id: '1' }, { restaurantId: 'r1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when resource belongs to restaurant', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('category');
    mockPrisma.category.findFirst.mockResolvedValue({ id: '1', restaurantId: 'r1' });
    const ctx = buildContext({ id: '1' }, { restaurantId: 'r1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws EntityNotFoundException when resource not found', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('category');
    mockPrisma.category.findFirst.mockResolvedValue(null);
    const ctx = buildContext({ id: '999' }, { restaurantId: 'r1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(EntityNotFoundException);
  });
});
```

**Step 2: Ejecutar para verificar que falla**

```bash
cd apps/api-core && pnpm test --testPathPattern="restaurant-resource.guard"
```

Expected: FAIL — "Cannot find module"

**Step 3: Implementar el guard**

```ts
// apps/api-core/src/common/guards/restaurant-resource.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../exceptions';

export const RESOURCE_MODEL_KEY = 'resourceModel';

export const ResourceGuard = (model: string) =>
  (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(RESOURCE_MODEL_KEY, model, descriptor?.value ?? target);
    return descriptor ?? target;
  };

@Injectable()
export class RestaurantResourceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const model = this.reflector.get<string>(RESOURCE_MODEL_KEY, context.getHandler());
    if (!model) return true;

    const request = context.switchToHttp().getRequest<{ params: Record<string, string>; user: { restaurantId: string } }>();
    const id = request.params.id;
    const { restaurantId } = request.user;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resource = await (this.prisma as any)[model].findFirst({
      where: { id, restaurantId },
    });

    if (!resource) throw new EntityNotFoundException(model, id);
    return true;
  }
}
```

**Step 4: Ejecutar tests**

```bash
cd apps/api-core && pnpm test --testPathPattern="restaurant-resource.guard"
```

Expected: PASS (3 tests)

**Step 5: Exportar desde common**

Agregar a `apps/api-core/src/common/guards/index.ts` (crear si no existe):

```ts
export { RestaurantResourceGuard, ResourceGuard, RESOURCE_MODEL_KEY } from './restaurant-resource.guard';
```

**Step 6: Commit**

```bash
git add apps/api-core/src/common/guards/
git commit -m "feat: add RestaurantResourceGuard for ownership validation"
```

---

## Task 3: Constantes en `config.ts`

**Files:**
- Modify: `apps/api-core/src/config.ts`

**Step 1: Agregar `DEFAULT_CATEGORY_NAME`**

En `apps/api-core/src/config.ts`, agregar después del bloque de products:

```ts
// products
export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 10;
export const DEFAULT_CATEGORY_NAME = 'default';
```

**Step 2: Commit**

```bash
git add apps/api-core/src/config.ts
git commit -m "feat: add DEFAULT_CATEGORY_NAME constant to config"
```

---

## Task 4: Refactorizar módulo `products` — service y exceptions

**Files:**
- Modify: `apps/api-core/src/products/products.service.ts`
- Modify: `apps/api-core/src/products/categories.service.ts`
- Modify: `apps/api-core/src/products/exceptions/products.exceptions.ts`
- Modify: `apps/api-core/src/products/products.module.ts`

**Step 1: Agregar `InsufficientStockException` a `products.exceptions.ts`**

```ts
// apps/api-core/src/products/exceptions/products.exceptions.ts
import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class DuplicateProductException extends BaseException {
  constructor(productName: string, restaurantId: string) {
    super(
      `Product '${productName}' already exists in this restaurant`,
      HttpStatus.CONFLICT,
      'DUPLICATE_PRODUCT',
      { productName, restaurantId },
    );
  }
}

export class InsufficientStockException extends BaseException {
  constructor(productName: string, available: number, requested: number) {
    super(
      `Insufficient stock for product '${productName}'. Available: ${available}, requested: ${requested}`,
      HttpStatus.CONFLICT,
      'INSUFFICIENT_STOCK',
      { productName, available, requested },
    );
  }
}
```

**Step 2: Escribir tests para `ProductsService`**

Crear `apps/api-core/src/products/products.service.spec.ts`:

```ts
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
```

**Step 3: Ejecutar tests para verificar que fallan**

```bash
cd apps/api-core && pnpm test --testPathPattern="products.service"
```

Expected: FAIL — importaciones no encontradas

**Step 4: Actualizar `products.service.ts`**

```ts
// apps/api-core/src/products/products.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Prisma, Product, Category } from '@prisma/client';

import { ProductRepository, CreateProductData } from './product.repository';
import { CategoryRepository } from './category.repository';
import { productConfig } from './product.config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { EntityNotFoundException } from '../common/exceptions';
import { InsufficientStockException } from './exceptions/products.exceptions';
import { ProductEventsService } from '../events/products.events';
import { DEFAULT_CATEGORY_NAME } from '../config';

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  stock?: number | null;
  imageUrl?: string;
}

@Injectable()
export class ProductsService {
  private readonly batchSize: number;

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    @Inject(productConfig.KEY)
    private readonly configService: ConfigType<typeof productConfig>,
    private readonly productEventsService: ProductEventsService,
  ) {
    this.batchSize = this.configService.batchSize;
  }

  async getOrCreateDefaultCategory(
    restaurantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Category> {
    return this.categoryRepository.findOrCreate({ name: DEFAULT_CATEGORY_NAME, restaurantId }, tx);
  }

  async createProduct(
    restaurantId: string,
    data: ProductInput,
    categoryId: string,
  ): Promise<Product> {
    const product = await this.productRepository.create({
      name: data.name,
      description: data.description,
      price: data.price,
      stock: data.stock,
      imageUrl: data.imageUrl,
      restaurantId,
      categoryId,
    });
    this.productEventsService.emitProductCreated(restaurantId);
    return product;
  }

  async createProductsBatch(
    restaurantId: string,
    categoryId: string,
    products: ProductInput[],
  ): Promise<{ totalCreated: number; batches: number }> {
    let totalCreated = 0;
    let batches = 0;

    for (let i = 0; i < products.length; i += this.batchSize) {
      const batch = products.slice(i, i + this.batchSize);
      const productsData: CreateProductData[] = batch.map((product) => ({
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        imageUrl: product.imageUrl,
        restaurantId,
        categoryId,
      }));
      const created = await this.productRepository.createMany(productsData);
      totalCreated += created;
      batches++;
    }

    return { totalCreated, batches };
  }

  async findByRestaurantId(restaurantId: string): Promise<Product[]> {
    return this.productRepository.findByRestaurantId(restaurantId);
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Product>> {
    const currentPage = page || 1;
    const currentLimit = limit || this.configService.defaultPageSize;
    const skip = (currentPage - 1) * currentLimit;

    const { data, total } = await this.productRepository.findByRestaurantIdPaginated(
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

  async findById(id: string, restaurantId: string): Promise<Product> {
    const product = await this.productRepository.findById(id, restaurantId);
    if (!product) throw new EntityNotFoundException('Product', id);
    return product;
  }

  async updateProduct(
    id: string,
    restaurantId: string,
    data: Partial<CreateProductData>,
  ): Promise<Product> {
    await this.findById(id, restaurantId);
    const product = await this.productRepository.update(id, restaurantId, data);
    this.productEventsService.emitProductUpdated(restaurantId);
    return product;
  }

  async decrementStock(
    productId: string,
    restaurantId: string,
    amount: number,
  ): Promise<Product> {
    const product = await this.productRepository.findById(productId, restaurantId);

    if (!product) throw new EntityNotFoundException('Product', productId);
    if (product.stock === null) return product;
    if (product.stock < amount) {
      throw new InsufficientStockException(product.name, product.stock, amount);
    }
    return this.productRepository.update(productId, restaurantId, {
      stock: product.stock - amount,
    });
  }

  async deleteProduct(id: string, restaurantId: string): Promise<Product> {
    await this.findById(id, restaurantId);
    const product = await this.productRepository.delete(id, restaurantId);
    this.productEventsService.emitProductDeleted(restaurantId);
    return product;
  }

  async createDemoProducts(restaurantId: string, categoryId: string): Promise<number> {
    const demoProducts: CreateProductData[] = [
      { name: 'Producto Demo 1', description: 'Este es un producto de demostración', price: 5.99, restaurantId, categoryId },
      { name: 'Producto Demo 2', description: 'Este es un producto de demostración', price: 8.50, restaurantId, categoryId },
      { name: 'Producto Demo 3', description: 'Este es un producto de demostración', price: 12.00, restaurantId, categoryId },
    ];
    return this.productRepository.createMany(demoProducts);
  }
}
```

**Step 5: Actualizar `categories.service.ts`**

```ts
// apps/api-core/src/products/categories.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Category } from '@prisma/client';

import { CategoryRepository, CreateCategoryData } from './category.repository';
import { productConfig } from './product.config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { EntityNotFoundException } from '../common/exceptions';
import { ProductEventsService } from '../events/products.events';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepository: CategoryRepository,
    @Inject(productConfig.KEY)
    private readonly configService: ConfigType<typeof productConfig>,
    private readonly productEventsService: ProductEventsService,
  ) {}

  async findByRestaurantId(restaurantId: string): Promise<Category[]> {
    return this.categoryRepository.findByRestaurantId(restaurantId);
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Category>> {
    const currentPage = page || 1;
    const currentLimit = limit || this.configService.defaultPageSize;
    const skip = (currentPage - 1) * currentLimit;

    const { data, total } = await this.categoryRepository.findByRestaurantIdPaginated(
      restaurantId,
      skip,
      currentLimit,
    );

    return {
      data,
      meta: { total, page: currentPage, limit: currentLimit, totalPages: Math.ceil(total / currentLimit) },
    };
  }

  async createCategory(restaurantId: string, name: string): Promise<Category> {
    const category = await this.categoryRepository.create({ name, restaurantId });
    this.productEventsService.emitCategoryCreated(restaurantId);
    return category;
  }

  async updateCategory(
    id: string,
    restaurantId: string,
    data: Partial<CreateCategoryData>,
  ): Promise<Category> {
    await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    const category = await this.categoryRepository.update(id, restaurantId, data);
    this.productEventsService.emitCategoryUpdated(restaurantId);
    return category;
  }

  async deleteCategory(id: string, restaurantId: string): Promise<Category> {
    await this.findCategoryAndThrowIfNotFound(id, restaurantId);
    const category = await this.categoryRepository.delete(id, restaurantId);
    this.productEventsService.emitCategoryDeleted(restaurantId);
    return category;
  }

  async findCategoryAndThrowIfNotFound(id: string, restaurantId: string): Promise<Category> {
    const category = await this.categoryRepository.findById(id, restaurantId);
    if (!category) throw new EntityNotFoundException('Category', id);
    return category;
  }
}
```

**Step 6: Actualizar `products.module.ts` para registrar `ProductEventsService`**

```ts
// apps/api-core/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { ProductRepository } from './product.repository';
import { CategoryRepository } from './category.repository';
import { EventsModule } from '../events/events.module';
import { productConfig } from './product.config';

@Module({
  imports: [ConfigModule.forFeature(productConfig), EventsModule],
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsService, CategoriesService, ProductRepository, CategoryRepository],
  exports: [ProductsService, CategoriesService, ProductRepository, CategoryRepository],
})
export class ProductsModule {}
```

**Step 7: Ejecutar tests**

```bash
cd apps/api-core && pnpm test --testPathPattern="products.service"
```

Expected: PASS

**Step 8: Commit**

```bash
git add apps/api-core/src/products/ apps/api-core/src/config.ts
git commit -m "refactor(products): use ProductEventsService, InsufficientStockException, DEFAULT_CATEGORY_NAME"
```

---

## Task 5: Refactorizar controllers de products — typing explícito + roles

**Files:**
- Modify: `apps/api-core/src/products/products.controller.ts`
- Modify: `apps/api-core/src/products/categories.controller.ts`
- Create: `apps/api-core/src/products/dto/paginated-products-response.dto.ts`
- Create: `apps/api-core/src/products/dto/paginated-categories-response.dto.ts`

**Step 1: Crear DTOs de respuesta paginada**

```ts
// apps/api-core/src/products/dto/paginated-products-response.dto.ts
import { Product } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

export type PaginatedProductsResponseDto = PaginatedResult<Product>;
```

```ts
// apps/api-core/src/products/dto/paginated-categories-response.dto.ts
import { Category } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

export type PaginatedCategoriesResponseDto = PaginatedResult<Category>;
```

**Step 2: Actualizar `products.controller.ts` con return types y roles**

```ts
// apps/api-core/src/products/products.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Role, Product } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedProductsResponseDto } from './dto/paginated-products-response.dto';

@ApiTags('products')
@ApiBearerAuth()
@Controller({ version: '1', path: 'products' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'List products (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ): Promise<PaginatedProductsResponseDto> {
    return this.productsService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page || 1,
      query.limit || 10,
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiResponse({ status: 200, description: 'Product found' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ): Promise<Product> {
    return this.productsService.findById(id, user.restaurantId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  async create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: { restaurantId: string },
  ): Promise<Product> {
    const { categoryId, ...productData } = createProductDto;
    return this.productsService.createProduct(user.restaurantId, productData, categoryId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a product' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: { restaurantId: string },
  ): Promise<Product> {
    return this.productsService.updateProduct(id, user.restaurantId, updateProductDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiResponse({ status: 200, description: 'Product deleted' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ): Promise<Product> {
    return this.productsService.deleteProduct(id, user.restaurantId);
  }
}
```

**Step 3: Actualizar `categories.controller.ts` con return types y roles**

```ts
// apps/api-core/src/products/categories.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Role, Category } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedCategoriesResponseDto } from './dto/paginated-categories-response.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller({ version: '1', path: 'categories' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'List categories (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of categories' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ): Promise<PaginatedCategoriesResponseDto> {
    return this.categoriesService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.createCategory(user.restaurantId, dto.name);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a category' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.updateCategory(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ): Promise<Category> {
    return this.categoriesService.deleteCategory(id, user.restaurantId);
  }
}
```

**Step 4: Verificar compilación**

```bash
cd apps/api-core && pnpm build 2>&1 | head -20
```

Expected: sin errores de TypeScript

**Step 5: Commit**

```bash
git add apps/api-core/src/products/
git commit -m "refactor(products): add explicit return types, swagger, BASIC role to GET endpoints"
```

---

## Task 6: Módulo `restaurants` — nuevo controller para cambio de nombre

**Files:**
- Create: `apps/api-core/src/restaurants/dto/rename-restaurant.dto.ts`
- Create: `apps/api-core/src/restaurants/restaurants.controller.ts`
- Modify: `apps/api-core/src/restaurants/restaurants.module.ts`
- Create: `apps/api-core/src/restaurants/restaurants.controller.spec.ts`

**Step 1: Crear DTO**

```ts
// apps/api-core/src/restaurants/dto/rename-restaurant.dto.ts
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenameRestaurantDto {
  @ApiProperty({ example: 'Mi Restaurante Nuevo' })
  @IsString()
  @MinLength(2)
  name: string;
}
```

**Step 2: Escribir test del controller**

```ts
// apps/api-core/src/restaurants/restaurants.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

const mockRestaurantsService = {
  update: jest.fn(),
};

describe('RestaurantsController', () => {
  let controller: RestaurantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantsController],
      providers: [{ provide: RestaurantsService, useValue: mockRestaurantsService }],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../auth/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RestaurantsController>(RestaurantsController);
    jest.clearAllMocks();
  });

  describe('rename', () => {
    it('calls service.update and returns slug', async () => {
      mockRestaurantsService.update.mockResolvedValue({ id: 'r1', slug: 'nuevo-nombre' });
      const user = { restaurantId: 'r1' };
      const result = await controller.rename(user, { name: 'Nuevo Nombre' });
      expect(mockRestaurantsService.update).toHaveBeenCalledWith('r1', { name: 'Nuevo Nombre' });
      expect(result).toEqual({ slug: 'nuevo-nombre' });
    });
  });
});
```

**Step 3: Ejecutar test para verificar que falla**

```bash
cd apps/api-core && pnpm test --testPathPattern="restaurants.controller"
```

Expected: FAIL — "Cannot find module './restaurants.controller'"

**Step 4: Crear `restaurants.controller.ts`**

```ts
// apps/api-core/src/restaurants/restaurants.controller.ts
import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RestaurantsService } from './restaurants.service';
import { RenameRestaurantDto } from './dto/rename-restaurant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller({ version: '1', path: 'restaurants' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Patch('name')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename the restaurant (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'New slug generated', schema: { example: { slug: 'mi-restaurante-nuevo' } } })
  async rename(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: RenameRestaurantDto,
  ): Promise<{ slug: string }> {
    const updated = await this.restaurantsService.update(user.restaurantId, { name: dto.name });
    return { slug: updated.slug };
  }
}
```

**Step 5: Actualizar `restaurants.module.ts`**

```ts
// apps/api-core/src/restaurants/restaurants.module.ts
import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { RestaurantsController } from './restaurants.controller';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantRepository],
  exports: [RestaurantsService, RestaurantRepository],
})
export class RestaurantsModule {}
```

**Step 6: Ejecutar tests**

```bash
cd apps/api-core && pnpm test --testPathPattern="restaurants.controller"
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/api-core/src/restaurants/
git commit -m "feat(restaurants): add PATCH /name endpoint for ADMIN-only restaurant renaming"
```

---

## Task 7: Refactorizar `kiosk.service.ts` — constantes y split de `getMenuItems`

**Files:**
- Modify: `apps/api-core/src/kiosk/kiosk.service.ts`
- Create: `apps/api-core/src/kiosk/kiosk.service.spec.ts`

**Step 1: Escribir tests para `getMenuItems`**

```ts
// apps/api-core/src/kiosk/kiosk.service.spec.ts
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

  describe('getMenuItems — stock status calculation', () => {
    const buildMenuWithStock = (stock: number | null, productStock: number | null) => ({
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

    it('returns AVAILABLE when effective stock is null (infinite)', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenuWithStock(null, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.AVAILABLE);
    });

    it('returns OUT_OF_STOCK when effective stock is 0', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenuWithStock(0, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.OUT_OF_STOCK);
    });

    it('returns LOW_STOCK when effective stock is <= 3', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenuWithStock(2, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.LOW_STOCK);
    });

    it('returns AVAILABLE when effective stock > 3', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(buildMenuWithStock(10, null));
      const result = await service.getMenuItems('test-rest', 'm1');
      expect(result.sections['Burgers'][0].stockStatus).toBe(STOCK_STATUS.AVAILABLE);
    });

    it('throws EntityNotFoundException when menu not found', async () => {
      mockMenuRepository.findByIdWithItems.mockResolvedValue(null);
      await expect(service.getMenuItems('test-rest', 'bad-id')).rejects.toThrow(EntityNotFoundException);
    });
  });
});
```

**Step 2: Ejecutar tests para verificar que fallan**

```bash
cd apps/api-core && pnpm test --testPathPattern="kiosk.service"
```

Expected: FAIL — `STOCK_STATUS` no exportado aún

**Step 3: Actualizar `kiosk.service.ts`**

```ts
// apps/api-core/src/kiosk/kiosk.service.ts
import { Injectable } from '@nestjs/common';
import { Restaurant } from '@prisma/client';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuRepository } from '../menus/menu.repository';
import { OrdersService } from '../orders/orders.service';
import { CashRegisterSessionRepository } from '../cash-register/cash-register-session.repository';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { EntityNotFoundException } from '../common/exceptions';
import { RegisterNotOpenException } from '../orders/exceptions/orders.exceptions';
import { STOCK_STATUS, StockStatus } from '../events/kiosk.events';

interface MenuItemEntry {
  id: string;
  menuItemId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stockStatus: StockStatus;
}

@Injectable()
export class KioskService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly menuRepository: MenuRepository,
    private readonly ordersService: OrdersService,
    private readonly registerSessionRepository: CashRegisterSessionRepository,
  ) {}

  async resolveRestaurant(slug: string): Promise<Restaurant> {
    const restaurant = await this.restaurantsService.findBySlug(slug);
    if (!restaurant) throw new EntityNotFoundException('Restaurant', { slug });
    return restaurant;
  }

  async getAvailableMenus(slug: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menus = await this.menuRepository.findByRestaurantId(restaurant.id);

    const { currentDay, currentTime } = this.getCurrentDayAndTime();
    return menus.filter((menu) => this.isMenuAvailable(menu, currentDay, currentTime));
  }

  async getMenuItems(slug: string, menuId: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menu = await this.menuRepository.findByIdWithItems(menuId, restaurant.id);

    if (!menu) throw new EntityNotFoundException('Menu', menuId);

    const sections = this.buildSections(menu.items);
    return { menuId: menu.id, menuName: menu.name, sections };
  }

  async getStatus(slug: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const session = await this.registerSessionRepository.findOpen(restaurant.id);
    return { registerOpen: !!session };
  }

  async createKioskOrder(slug: string, dto: CreateOrderDto) {
    const restaurant = await this.resolveRestaurant(slug);
    const session = await this.registerSessionRepository.findOpen(restaurant.id);
    if (!session) throw new RegisterNotOpenException();
    return this.ordersService.createOrder(restaurant.id, session.id, dto);
  }

  // Private helpers

  private getCurrentDayAndTime(): { currentDay: string; currentTime: string } {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return {
      currentDay: days[now.getDay()],
      currentTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    };
  }

  private isMenuAvailable(menu: { active: boolean; daysOfWeek?: string | null; startTime?: string | null; endTime?: string | null }, currentDay: string, currentTime: string): boolean {
    if (!menu.active) return false;
    if (menu.daysOfWeek) {
      const allowedDays = menu.daysOfWeek.split(',').map((d) => d.trim());
      if (!allowedDays.includes(currentDay)) return false;
    }
    if (menu.startTime && currentTime < menu.startTime) return false;
    if (menu.endTime && currentTime > menu.endTime) return false;
    return true;
  }

  private computeStockStatus(effectiveStock: number | null): StockStatus {
    if (effectiveStock === null) return STOCK_STATUS.AVAILABLE;
    if (effectiveStock <= 0) return STOCK_STATUS.OUT_OF_STOCK;
    if (effectiveStock <= 3) return STOCK_STATUS.LOW_STOCK;
    return STOCK_STATUS.AVAILABLE;
  }

  private buildSections(items: Array<{
    id: string;
    sectionName?: string | null;
    stock: number | null;
    price: unknown;
    product: { id: string; name: string; description: string | null; price: unknown; imageUrl: string | null; stock: number | null };
  }>): Record<string, MenuItemEntry[]> {
    const sections: Record<string, MenuItemEntry[]> = {};

    for (const item of items) {
      const sectionName = item.sectionName || 'General';
      if (!sections[sectionName]) sections[sectionName] = [];

      const effectiveStock = item.stock !== null ? item.stock : item.product.stock;
      const price = item.price !== null ? Number(item.price) : Number(item.product.price);

      sections[sectionName].push({
        id: item.product.id,
        menuItemId: item.id,
        name: item.product.name,
        description: item.product.description,
        price,
        imageUrl: item.product.imageUrl,
        stockStatus: this.computeStockStatus(effectiveStock),
      });
    }

    return sections;
  }
}
```

**Step 4: Ejecutar tests**

```bash
cd apps/api-core && pnpm test --testPathPattern="kiosk.service"
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api-core/src/kiosk/
git commit -m "refactor(kiosk): use STOCK_STATUS constants, split getMenuItems into helpers"
```

---

## Task 8: Refactorizar `orders.service.ts` — split `createOrder` y constantes

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts`
- Modify: `apps/api-core/src/orders/orders.controller.ts`
- Modify: `apps/api-core/src/orders/orders.module.ts`
- Create: `apps/api-core/src/orders/orders.service.spec.ts`

**Step 1: Escribir tests para `OrdersService`**

```ts
// apps/api-core/src/orders/orders.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrderRepository } from './order.repository';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService } from '../events/orders.events';
import { EmailService } from '../email/email.service';
import { PrintService } from '../print/print.service';
import {
  OrderNotFoundException,
  OrderAlreadyCancelledException,
  InvalidStatusTransitionException,
  OrderNotPaidException,
} from './exceptions/orders.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';

const mockOrderRepository = {
  findById: jest.fn(),
  createWithItems: jest.fn(),
  updateStatus: jest.fn(),
  cancelOrder: jest.fn(),
  markAsPaid: jest.fn(),
  findByRestaurantId: jest.fn(),
};
const mockPrisma = { $transaction: jest.fn((cb) => cb(mockPrisma)), product: { findUnique: jest.fn(), update: jest.fn() }, menuItem: { findUnique: jest.fn(), update: jest.fn() }, registerSession: { update: jest.fn() } };
const mockOrderEvents = { emitOrderCreated: jest.fn(), emitOrderUpdated: jest.fn() };
const mockEmail = { sendReceiptEmail: jest.fn() };
const mockPrint = { generateReceipt: jest.fn() };

const makeOrder = (overrides = {}) => ({
  id: 'o1', restaurantId: 'r1', status: OrderStatus.CREATED, isPaid: false, customerEmail: null, ...overrides,
});

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrderEventsService, useValue: mockOrderEvents },
        { provide: EmailService, useValue: mockEmail },
        { provide: PrintService, useValue: mockPrint },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('throws OrderNotFoundException when order not found', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);
      await expect(service.findById('bad', 'r1')).rejects.toThrow(OrderNotFoundException);
    });

    it('throws ForbiddenAccessException when restaurantId mismatches', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ restaurantId: 'other' }));
      await expect(service.findById('o1', 'r1')).rejects.toThrow(ForbiddenAccessException);
    });

    it('returns order when found and authorized', async () => {
      const order = makeOrder();
      mockOrderRepository.findById.mockResolvedValue(order);
      expect(await service.findById('o1', 'r1')).toEqual(order);
    });
  });

  describe('updateOrderStatus', () => {
    it('throws OrderAlreadyCancelledException for CANCELLED order', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.PROCESSING)).rejects.toThrow(OrderAlreadyCancelledException);
    });

    it('throws InvalidStatusTransitionException for backward transitions', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.CREATED)).rejects.toThrow(InvalidStatusTransitionException);
    });

    it('throws OrderNotPaidException when completing unpaid order', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PROCESSING, isPaid: false }));
      await expect(service.updateOrderStatus('o1', 'r1', OrderStatus.COMPLETED)).rejects.toThrow(OrderNotPaidException);
    });

    it('emits updated event on success', async () => {
      const updated = makeOrder({ status: OrderStatus.PROCESSING });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.updateStatus.mockResolvedValue(updated);
      await service.updateOrderStatus('o1', 'r1', OrderStatus.PROCESSING);
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', updated);
    });
  });

  describe('cancelOrder', () => {
    it('throws OrderAlreadyCancelledException when already cancelled', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));
      await expect(service.cancelOrder('o1', 'r1', 'reason')).rejects.toThrow(OrderAlreadyCancelledException);
    });

    it('throws InvalidStatusTransitionException when COMPLETED', async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.COMPLETED }));
      await expect(service.cancelOrder('o1', 'r1', 'reason')).rejects.toThrow(InvalidStatusTransitionException);
    });

    it('emits updated event on success', async () => {
      const cancelled = makeOrder({ status: OrderStatus.CANCELLED });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CREATED }));
      mockOrderRepository.cancelOrder.mockResolvedValue(cancelled);
      await service.cancelOrder('o1', 'r1', 'reason');
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', cancelled);
    });
  });

  describe('markAsPaid', () => {
    it('emits updated event and returns order', async () => {
      const paid = makeOrder({ isPaid: true });
      mockOrderRepository.findById.mockResolvedValue(makeOrder());
      mockOrderRepository.markAsPaid.mockResolvedValue(paid);
      const result = await service.markAsPaid('o1', 'r1');
      expect(mockOrderEvents.emitOrderUpdated).toHaveBeenCalledWith('r1', paid);
      expect(result).toEqual(paid);
    });
  });
});
```

**Step 2: Ejecutar para verificar que fallan**

```bash
cd apps/api-core && pnpm test --testPathPattern="orders.service"
```

Expected: FAIL

**Step 3: Actualizar `orders.service.ts`**

```ts
// apps/api-core/src/orders/orders.service.ts
import {
  BadRequestException, Injectable, Logger, Inject, forwardRef,
} from '@nestjs/common';
import { OrderStatus, Product, MenuItem, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { OrderRepository } from './order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderNotFoundException,
  StockInsufficientException,
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  OrderNotPaidException,
} from './exceptions/orders.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';
import { EmailService } from '../email/email.service';
import { PrintService } from '../print/print.service';
import { OrderEventsService } from '../events/orders.events';

const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PROCESSING,
  OrderStatus.COMPLETED,
];

type OrderItemEntry = {
  productId: string;
  menuItemId?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
};

type StockEntry = {
  product: Product;
  menuItem: MenuItem | null;
  item: CreateOrderDto['items'][number];
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly prisma: PrismaService,
    private readonly orderEventsService: OrderEventsService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => PrintService))
    private readonly printService: PrintService,
  ) {}

  async createOrder(restaurantId: string, registerSessionId: string, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const { orderItems, stockEntries, totalAmount } = await this.validateAndBuildItems(restaurantId, dto, tx);
      this.validateExpectedTotal(totalAmount, dto.expectedTotal);
      await this.decrementAllStock(stockEntries, tx);
      const order = await this.persistOrder({ restaurantId, registerSessionId, totalAmount, dto, orderItems }, tx);
      this.orderEventsService.emitOrderCreated(restaurantId, order);
      return order;
    });
  }

  async findByRestaurantId(restaurantId: string, status?: OrderStatus) {
    return this.orderRepository.findByRestaurantId(restaurantId, status);
  }

  async findById(id: string, restaurantId: string) {
    const order = await this.orderRepository.findById(id);
    if (!order) throw new OrderNotFoundException(id);
    if (order.restaurantId !== restaurantId) throw new ForbiddenAccessException();
    return order;
  }

  async updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus) {
    const order = await this.findById(id, restaurantId);

    if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const targetIdx = STATUS_ORDER.indexOf(newStatus);
    if (targetIdx <= currentIdx || targetIdx === -1) {
      throw new InvalidStatusTransitionException(order.status, newStatus);
    }

    if (newStatus === OrderStatus.COMPLETED && !order.isPaid) {
      throw new OrderNotPaidException(id);
    }

    const updated = await this.orderRepository.updateStatus(id, newStatus);
    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

  async cancelOrder(id: string, restaurantId: string, reason: string) {
    const order = await this.findById(id, restaurantId);

    if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);
    if (order.status !== OrderStatus.CREATED && order.status !== OrderStatus.PROCESSING) {
      throw new InvalidStatusTransitionException(order.status, OrderStatus.CANCELLED);
    }

    const cancelled = await this.orderRepository.cancelOrder(id, reason);
    this.orderEventsService.emitOrderUpdated(restaurantId, cancelled);
    return cancelled;
  }

  async markAsPaid(id: string, restaurantId: string) {
    await this.findById(id, restaurantId);
    const updatedOrder = await this.orderRepository.markAsPaid(id);
    this.orderEventsService.emitOrderUpdated(restaurantId, updatedOrder);

    if (updatedOrder.customerEmail && this.printService && this.emailService) {
      try {
        const receipt = await this.printService.generateReceipt(id);
        await this.emailService.sendReceiptEmail(updatedOrder.customerEmail, receipt);
      } catch (error) {
        this.logger.error(`Failed to send receipt email for order ${id}`, error);
      }
    }

    return updatedOrder;
  }

  // Private helpers

  private async validateAndBuildItems(
    restaurantId: string,
    dto: CreateOrderDto,
    tx: Prisma.TransactionClient,
  ): Promise<{ orderItems: OrderItemEntry[]; stockEntries: StockEntry[]; totalAmount: number }> {
    const orderItems: OrderItemEntry[] = [];
    const stockEntries: StockEntry[] = [];

    for (const item of dto.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.restaurantId !== restaurantId) {
        throw new StockInsufficientException(item.productId, 0, item.quantity);
      }

      const menuItem = item.menuItemId
        ? await tx.menuItem.findUnique({ where: { id: item.menuItemId } })
        : null;

      const unitPrice = menuItem?.price !== null && menuItem?.price !== undefined
        ? Number(menuItem.price)
        : Number(product.price);

      this.validateStock(product, menuItem, item);

      orderItems.push({ productId: item.productId, menuItemId: item.menuItemId, quantity: item.quantity, unitPrice, subtotal: unitPrice * item.quantity, notes: item.notes });
      stockEntries.push({ product, menuItem, item });
    }

    const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
    return { orderItems, stockEntries, totalAmount };
  }

  private validateStock(product: Product, menuItem: MenuItem | null, item: CreateOrderDto['items'][number]): void {
    if (product.stock !== null && product.stock < item.quantity) {
      throw new StockInsufficientException(product.name, product.stock, item.quantity);
    }
    if (menuItem && menuItem.stock !== null && menuItem.stock < item.quantity) {
      throw new StockInsufficientException(`${product.name} (menu)`, menuItem.stock, item.quantity);
    }
  }

  private validateExpectedTotal(totalAmount: number, expectedTotal?: number): void {
    if (expectedTotal !== undefined && Math.abs(totalAmount - expectedTotal) > 0.01) {
      throw new BadRequestException(
        'Los precios de tu pedido han cambiado. Por favor revisa el carrito e intenta de nuevo.',
      );
    }
  }

  private async decrementAllStock(stockEntries: StockEntry[], tx: Prisma.TransactionClient): Promise<void> {
    for (const { product, menuItem, item } of stockEntries) {
      if (product.stock !== null) {
        await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
      }
      if (menuItem && menuItem.stock !== null) {
        await tx.menuItem.update({ where: { id: item.menuItemId }, data: { stock: { decrement: item.quantity } } });
      }
    }
  }

  private async persistOrder(
    params: {
      restaurantId: string;
      registerSessionId: string;
      totalAmount: number;
      dto: CreateOrderDto;
      orderItems: OrderItemEntry[];
    },
    tx: Prisma.TransactionClient,
  ) {
    const session = await tx.registerSession.update({
      where: { id: params.registerSessionId },
      data: { lastOrderNumber: { increment: 1 } },
    });

    return this.orderRepository.createWithItems({
      orderNumber: session.lastOrderNumber,
      totalAmount: params.totalAmount,
      restaurantId: params.restaurantId,
      registerSessionId: params.registerSessionId,
      paymentMethod: params.dto.paymentMethod,
      customerEmail: params.dto.customerEmail,
      items: params.orderItems,
    }, tx);
  }
}
```

**Step 4: Actualizar `orders.module.ts` para inyectar `OrderEventsService`**

```ts
// apps/api-core/src/orders/orders.module.ts
import { Module, forwardRef } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderRepository } from './order.repository';
import { EmailModule } from '../email/email.module';
import { PrintModule } from '../print/print.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EmailModule, forwardRef(() => PrintModule), EventsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
```

**Step 5: Actualizar `orders.controller.ts` con return types**

```ts
// apps/api-core/src/orders/orders.controller.ts
import {
  Controller, Get, Patch, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { Role, OrderStatus } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ version: '1', path: 'orders' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'List orders by restaurant' })
  @ApiResponse({ status: 200, description: 'List of orders' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findByRestaurantId(user.restaurantId, status);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.ordersService.findById(id, user.restaurantId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, user.restaurantId, dto.status);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark order as paid' })
  @ApiResponse({ status: 200, description: 'Order marked as paid' })
  async markAsPaid(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.ordersService.markAsPaid(id, user.restaurantId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiResponse({ status: 200, description: 'Order cancelled' })
  async cancelOrder(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(id, user.restaurantId, dto.reason);
  }
}
```

**Step 6: Ejecutar tests**

```bash
cd apps/api-core && pnpm test --testPathPattern="orders.service"
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/api-core/src/orders/
git commit -m "refactor(orders): split createOrder into helpers, use OrderStatus enum, inject OrderEventsService"
```

---

## Task 9: Tests para `CategoriesService`

**Files:**
- Create: `apps/api-core/src/products/categories.service.spec.ts`

**Step 1: Escribir y ejecutar tests**

```ts
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
    it('creates and emits event', async () => {
      const cat = { id: 'c1', name: 'Burgers', restaurantId: 'r1' };
      mockCategoryRepo.create.mockResolvedValue(cat);
      const result = await service.createCategory('r1', 'Burgers');
      expect(mockEvents.emitCategoryCreated).toHaveBeenCalledWith('r1');
      expect(result).toEqual(cat);
    });
  });

  describe('updateCategory', () => {
    it('throws when category not found', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);
      await expect(service.updateCategory('c999', 'r1', { name: 'X' })).rejects.toThrow(EntityNotFoundException);
    });

    it('updates and emits event', async () => {
      const cat = { id: 'c1', name: 'Burgers', restaurantId: 'r1' };
      mockCategoryRepo.findById.mockResolvedValue(cat);
      mockCategoryRepo.update.mockResolvedValue({ ...cat, name: 'Updated' });
      await service.updateCategory('c1', 'r1', { name: 'Updated' });
      expect(mockEvents.emitCategoryUpdated).toHaveBeenCalledWith('r1');
    });
  });

  describe('deleteCategory', () => {
    it('throws when category not found', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);
      await expect(service.deleteCategory('c999', 'r1')).rejects.toThrow(EntityNotFoundException);
    });

    it('deletes and emits event', async () => {
      const cat = { id: 'c1', restaurantId: 'r1' };
      mockCategoryRepo.findById.mockResolvedValue(cat);
      mockCategoryRepo.delete.mockResolvedValue(cat);
      await service.deleteCategory('c1', 'r1');
      expect(mockEvents.emitCategoryDeleted).toHaveBeenCalledWith('r1');
    });
  });

  describe('findByRestaurantIdPaginated', () => {
    it('returns paginated result', async () => {
      mockCategoryRepo.findByRestaurantIdPaginated.mockResolvedValue({ data: [], total: 0 });
      const result = await service.findByRestaurantIdPaginated('r1', 1, 10);
      expect(result.meta.total).toBe(0);
      expect(result.meta.page).toBe(1);
    });
  });
});
```

**Step 2: Ejecutar tests**

```bash
cd apps/api-core && pnpm test --testPathPattern="categories.service"
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/api-core/src/products/categories.service.spec.ts
git commit -m "test(products): add CategoriesService unit tests"
```

---

## Task 10: Documentación por módulo en `docs/modules/`

**Files:**
- Create: `apps/api-core/docs/modules/products.md`
- Create: `apps/api-core/docs/modules/categories.md`
- Create: `apps/api-core/docs/modules/orders.md`
- Create: `apps/api-core/docs/modules/kiosk.md`
- Create: `apps/api-core/docs/modules/restaurants.md`

**Step 1: Crear directorio y documentos**

```bash
mkdir -p apps/api-core/docs/modules
```

Cada documento debe incluir:
1. **Descripción** del módulo
2. **Autenticación requerida** (JWT, roles permitidos)
3. **Endpoints** con método, path, body, response
4. **Diagramas Mermaid** de flujos principales

**Ejemplo: `products.md`**

```markdown
# Products Module

## Description
Manages products for a restaurant. Products belong to a category.

## Authentication
All endpoints require JWT. `BASIC` role can only read (GET).

## Roles
| Operation | Roles |
|---|---|
| GET | ADMIN, MANAGER, BASIC |
| POST, PATCH, DELETE | ADMIN, MANAGER |

## Endpoints
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /v1/products | — | PaginatedResult<Product> |
| GET | /v1/products/:id | — | Product |
| POST | /v1/products | CreateProductDto | Product |
| PATCH | /v1/products/:id | UpdateProductDto | Product |
| DELETE | /v1/products/:id | — | Product |

## Create Product Flow

\`\`\`mermaid
sequenceDiagram
    participant C as Controller
    participant S as ProductsService
    participant R as ProductRepository
    participant E as ProductEventsService

    C->>S: createProduct(restaurantId, data, categoryId)
    S->>R: create(data)
    R-->>S: Product
    S->>E: emitProductCreated(restaurantId)
    S-->>C: Product
\`\`\`

## Decrement Stock Flow

\`\`\`mermaid
flowchart TD
    A[decrementStock] --> B{product found?}
    B -- No --> C[throw EntityNotFoundException]
    B -- Yes --> D{stock is null?}
    D -- Yes --> E[return product unchanged]
    D -- No --> F{stock < amount?}
    F -- Yes --> G[throw InsufficientStockException]
    F -- No --> H[update stock = stock - amount]
    H --> I[return updated product]
\`\`\`
```

**Step 2: Repetir para orders, categories, kiosk, restaurants** siguiendo el mismo formato.

**Step 3: Commit**

```bash
git add apps/api-core/docs/modules/
git commit -m "docs: add module documentation with mermaid flows for products, orders, kiosk, restaurants, categories"
```

---

## Task 11: Verificación final de cobertura

**Step 1: Ejecutar suite completa con cobertura**

```bash
cd apps/api-core && pnpm test:cov
```

Expected: ≥80% en los módulos: products, orders, kiosk, restaurants

**Step 2: Si algún módulo está por debajo del 80%, agregar tests faltantes**

Ver el reporte en `apps/api-core/coverage/lcov-report/index.html` para identificar ramas no cubiertas.

**Step 3: Ejecutar build para verificar compilación**

```bash
cd apps/api-core && pnpm build
```

Expected: sin errores TypeScript

**Step 4: Commit final**

```bash
git add .
git commit -m "test: ensure ≥80% coverage across refactored modules"
```
