# Cash Register Stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear `CashRegisterStatsService` con `CashShiftStatsSerializer` y exponer `GET /v1/cash-register/stats` para métricas en vivo de la sesión activa, reutilizando el servicio en el cierre de caja y los endpoints de resumen histórico.

**Architecture:** `CashRegisterStatsService` vive dentro del módulo `cash-register`. `getStats(sessionId, restaurantId)` ejecuta 2 queries en paralelo (un `order.groupBy` multidimensional + `orderItem.groupBy`) e itera en memoria una sola vez para construir todos los agregados. La respuesta se serializa con `CashShiftStatsSerializer` usando `@Exclude`/`@Expose`/`@Type` de class-transformer. Los métodos `getSessionSummary` y `getTopProducts` de `CashRegisterService` y el archivo `session-summary.serializer.ts` se eliminan y reemplazan.

**Tech Stack:** NestJS, Prisma, class-transformer (`@Exclude`, `@Expose`, `@Type`), Jest (unit), Supertest (e2e)

**Spec:** `docs/superpowers/specs/2026-05-21-cash-register-stats-design.md`

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `prisma/schema.postgresql.prisma` | Modificar | Agregar `@@index([orderId])` a `OrderItem` |
| `src/cash-register/cash-register-stats.service.ts` | Crear | Tipos `ShiftStats` + lógica de agregación |
| `src/cash-register/cash-register-stats.service.spec.ts` | Crear | Unit tests |
| `src/cash-register/serializers/cash-register-stats.serializer.ts` | Crear | Jerarquía de clases `@Exclude`/`@Expose`/`@Type` |
| `src/cash-register/cash-register.module.ts` | Modificar | Registrar `CashRegisterStatsService` como provider |
| `src/cash-register/cash-register.controller.ts` | Modificar | Agregar `GET /stats`; inyectar `CashRegisterStatsService`; refactorizar `summary` y `top-products` |
| `src/cash-register/cash-register.service.ts` | Modificar | Inyectar `CashRegisterStatsService`; refactorizar `closeSession`; agregar `getSessionStats`; eliminar `getSessionSummary` y `getTopProducts` |
| `src/cash-register/dto/cash-register-response.dto.ts` | Modificar | Agregar DTOs Swagger para el response de stats |
| `src/cash-register/serializers/session-summary.serializer.ts` | Eliminar | Reemplazado por `CashShiftStatsSerializer` |
| `test/cash-register/cashRegisterStats.e2e-spec.ts` | Crear | E2E tests para `GET /stats` |

---

### Task 1: Agregar índice `OrderItem.orderId` en Prisma

**Files:**
- Modify: `apps/api-core/prisma/schema.postgresql.prisma`

- [ ] **Step 1: Agregar `@@index([orderId])` al modelo `OrderItem`**

En `prisma/schema.postgresql.prisma`, buscar el modelo `OrderItem` y agregar el índice al final:

```prisma
model OrderItem {
  id        String  @id @default(uuid())
  quantity  Int
  unitPrice BigInt
  subtotal  BigInt
  notes     String?

  orderId    String
  order      Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId  String
  product    Product   @relation(fields: [productId], references: [id])
  menuItemId String?
  menuItem   MenuItem? @relation(fields: [menuItemId], references: [id])

  createdAt DateTime @default(now())

  @@index([orderId])
}
```

- [ ] **Step 2: Ejecutar la migración**

```bash
docker compose exec res-api-core pnpm exec prisma migrate dev --name add-order-item-order-id-index
```

Resultado esperado: migración creada y aplicada. La salida incluye `✔ Generated Prisma Client`.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/prisma/schema.postgresql.prisma apps/api-core/prisma/migrations/
git commit -m "feat(db): add index on OrderItem.orderId for top-products aggregation query"
```

---

### Task 2: Crear `CashRegisterStatsService` (tipos + skeleton)

**Files:**
- Create: `apps/api-core/src/cash-register/cash-register-stats.service.ts`

- [ ] **Step 1: Crear el archivo con tipos y stub**

```typescript
// apps/api-core/src/cash-register/cash-register-stats.service.ts
import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from './exceptions/cash-register.exceptions';

export interface ShiftCounts {
  total: number;
  created: number;
  confirmed: number;
  processing: number;
  served: number;
  completed: number;
  cancelled: number;
  pending: number;
}

export interface ShiftRevenue {
  completed: bigint;
  pending: bigint;
  averageTicket: bigint;
}

export interface ShiftTopProduct {
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}

export interface ShiftStats {
  counts: ShiftCounts;
  revenue: ShiftRevenue;
  byPaymentMethod: Array<{ method: string; count: number; total: bigint }>;
  byOrderType: Array<{ type: string; count: number }>;
  byOrderSource: Array<{ source: string; count: number }>;
  topProducts: ShiftTopProduct[];
}

export function emptyShiftStats(): ShiftStats {
  return {
    counts: {
      total: 0, created: 0, confirmed: 0, processing: 0,
      served: 0, completed: 0, cancelled: 0, pending: 0,
    },
    revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
    byPaymentMethod: [],
    byOrderType: [],
    byOrderSource: [],
    topProducts: [],
  };
}

@Injectable()
export class CashRegisterStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashShiftRepository: CashShiftRepository,
  ) {}

  async getStats(_sessionId: string, _restaurantId: string): Promise<ShiftStats> {
    throw new Error('Not implemented');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register-stats.service.ts
git commit -m "feat(cash-register): add CashRegisterStatsService skeleton with ShiftStats types"
```

---

### Task 3: Escribir unit tests (deben fallar)

**Files:**
- Create: `apps/api-core/src/cash-register/cash-register-stats.service.spec.ts`

- [ ] **Step 1: Crear el archivo de spec**

```typescript
// apps/api-core/src/cash-register/cash-register-stats.service.spec.ts
import { Test } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';

import { CashRegisterStatsService } from './cash-register-stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from './exceptions/cash-register.exceptions';

const SESSION_ID = 'session-uuid';
const RESTAURANT_ID = 'restaurant-uuid';

const mockPrisma = {
  order: { groupBy: jest.fn() },
  orderItem: { groupBy: jest.fn() },
  product: { findMany: jest.fn() },
};

const mockCashShiftRepository = {
  findById: jest.fn(),
};

describe('CashRegisterStatsService', () => {
  let service: CashRegisterStatsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CashRegisterStatsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CashShiftRepository, useValue: mockCashShiftRepository },
      ],
    }).compile();

    service = module.get(CashRegisterStatsService);
    jest.clearAllMocks();
  });

  function setupValidSession(restaurantId = RESTAURANT_ID) {
    mockCashShiftRepository.findById.mockResolvedValue({
      id: SESSION_ID,
      restaurantId,
    });
  }

  function setupEmptyOrders() {
    mockPrisma.order.groupBy.mockResolvedValue([]);
    mockPrisma.orderItem.groupBy.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([]);
  }

  describe('getStats', () => {
    it('lanza CashRegisterNotFoundException cuando la sesión no existe', async () => {
      mockCashShiftRepository.findById.mockResolvedValue(null);
      setupEmptyOrders();

      await expect(service.getStats(SESSION_ID, RESTAURANT_ID)).rejects.toThrow(
        CashRegisterNotFoundException,
      );
    });

    it('lanza CashRegisterNotFoundException cuando la sesión pertenece a otro restaurante', async () => {
      setupValidSession('otro-restaurante-id');
      setupEmptyOrders();

      await expect(service.getStats(SESSION_ID, RESTAURANT_ID)).rejects.toThrow(
        CashRegisterNotFoundException,
      );
    });

    it('retorna stats en cero para una sesión vacía', async () => {
      setupValidSession();
      setupEmptyOrders();

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.counts).toEqual({
        total: 0, created: 0, confirmed: 0, processing: 0,
        served: 0, completed: 0, cancelled: 0, pending: 0,
      });
      expect(stats.revenue).toEqual({ completed: 0n, pending: 0n, averageTicket: 0n });
      expect(stats.byPaymentMethod).toEqual([]);
      expect(stats.byOrderType).toEqual([]);
      expect(stats.byOrderSource).toEqual([]);
      expect(stats.topProducts).toEqual([]);
    });

    it('cuenta cada status correctamente y calcula pending', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.CREATED,    paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK',  _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CONFIRMED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.SERVED,     paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 1 }, _sum: { totalAmount: 1200n } },
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF',  _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK',  _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.counts.total).toBe(9);
      expect(stats.counts.created).toBe(2);
      expect(stats.counts.confirmed).toBe(1);
      expect(stats.counts.processing).toBe(1);
      expect(stats.counts.served).toBe(1);
      expect(stats.counts.completed).toBe(3);
      expect(stats.counts.cancelled).toBe(1);
      expect(stats.counts.pending).toBe(5); // 9 - 3 completed - 1 cancelled
    });

    it('calcula revenue correctamente (completed, pending, averageTicket)', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.COMPLETED,  paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 2 }, _sum: { totalAmount: 4000n } },
        { status: OrderStatus.PROCESSING, paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1500n } },
        { status: OrderStatus.CANCELLED,  paymentMethod: null,   orderType: 'PICKUP', orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.revenue.completed).toBe(4000n);
      expect(stats.revenue.pending).toBe(1500n);    // PROCESSING; CANCELLED excluido
      expect(stats.revenue.averageTicket).toBe(2000n); // 4000n / 2
    });

    it('averageTicket es 0n cuando no hay pedidos completados', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.CREATED, paymentMethod: null, orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1000n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.revenue.averageTicket).toBe(0n);
    });

    it('byPaymentMethod incluye solo órdenes COMPLETED', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 2 }, _sum: { totalAmount: 4000n } },
        { status: OrderStatus.COMPLETED, paymentMethod: 'CARD', orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CANCELLED, paymentMethod: 'CASH', orderType: 'PICKUP', orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  500n } },
        { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'PICKUP', orderSource: 'STAFF', _count: { id: 1 }, _sum: { totalAmount: 1000n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.byPaymentMethod).toHaveLength(2);
      expect(stats.byPaymentMethod).toEqual(
        expect.arrayContaining([
          { method: 'CASH', count: 2, total: 4000n },
          { method: 'CARD', count: 1, total: 2000n },
        ]),
      );
    });

    it('byOrderType agrega todos los statuses incluyendo CANCELLED', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.COMPLETED, paymentMethod: 'CASH', orderType: 'PICKUP',   orderSource: 'STAFF', _count: { id: 3 }, _sum: { totalAmount: 6000n } },
        { status: OrderStatus.CREATED,   paymentMethod: null,   orderType: 'DELIVERY', orderSource: 'KIOSK', _count: { id: 2 }, _sum: { totalAmount: 2000n } },
        { status: OrderStatus.CANCELLED, paymentMethod: null,   orderType: 'PICKUP',   orderSource: 'KIOSK', _count: { id: 1 }, _sum: { totalAmount:  800n } },
      ]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.byOrderType).toEqual(
        expect.arrayContaining([
          { type: 'PICKUP', count: 4 },
          { type: 'DELIVERY', count: 2 },
        ]),
      );
    });

    it('retorna top products con id, name, quantity y total', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'prod-1', _sum: { quantity: 10, subtotal: 5000n } },
        { productId: 'prod-2', _sum: { quantity:  5, subtotal: 2500n } },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Burger' },
        { id: 'prod-2', name: 'Fries'  },
      ]);

      const stats = await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(stats.topProducts).toEqual([
        { id: 'prod-1', name: 'Burger', quantity: 10, total: 5000n },
        { id: 'prod-2', name: 'Fries',  quantity:  5, total: 2500n },
      ]);
    });

    it('no llama product.findMany cuando no hay top products', async () => {
      setupValidSession();
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);

      await service.getStats(SESSION_ID, RESTAURANT_ID);

      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

```bash
docker compose exec res-api-core pnpm test cash-register-stats.service.spec
```

Resultado esperado: todos los tests fallan con `Error: Not implemented`.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register-stats.service.spec.ts
git commit -m "test(cash-register): add failing unit tests for CashRegisterStatsService"
```

---

### Task 4: Implementar `CashRegisterStatsService.getStats()`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register-stats.service.ts`

- [ ] **Step 1: Reemplazar el stub con la implementación completa**

Reemplazar el contenido de `cash-register-stats.service.ts` con:

```typescript
import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from './exceptions/cash-register.exceptions';

export interface ShiftCounts {
  total: number;
  created: number;
  confirmed: number;
  processing: number;
  served: number;
  completed: number;
  cancelled: number;
  pending: number;
}

export interface ShiftRevenue {
  completed: bigint;
  pending: bigint;
  averageTicket: bigint;
}

export interface ShiftTopProduct {
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}

export interface ShiftStats {
  counts: ShiftCounts;
  revenue: ShiftRevenue;
  byPaymentMethod: Array<{ method: string; count: number; total: bigint }>;
  byOrderType: Array<{ type: string; count: number }>;
  byOrderSource: Array<{ source: string; count: number }>;
  topProducts: ShiftTopProduct[];
}

export function emptyShiftStats(): ShiftStats {
  return {
    counts: {
      total: 0, created: 0, confirmed: 0, processing: 0,
      served: 0, completed: 0, cancelled: 0, pending: 0,
    },
    revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
    byPaymentMethod: [],
    byOrderType: [],
    byOrderSource: [],
    topProducts: [],
  };
}

@Injectable()
export class CashRegisterStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashShiftRepository: CashShiftRepository,
  ) {}

  async getStats(sessionId: string, restaurantId: string): Promise<ShiftStats> {
    const session = await this.cashShiftRepository.findById(sessionId);
    if (!session || session.restaurantId !== restaurantId) {
      throw new CashRegisterNotFoundException(sessionId);
    }

    const [groups, topProductRows] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status', 'paymentMethod', 'orderType', 'orderSource'],
        where: { cashShiftId: sessionId },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { cashShiftId: sessionId, status: { not: OrderStatus.CANCELLED } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    const countsByStatus: Record<string, number> = {};
    const revenueByStatus: Record<string, bigint> = {};
    const paymentMethodMap: Record<string, { count: number; total: bigint }> = {};
    const orderTypeMap: Record<string, number> = {};
    const orderSourceMap: Record<string, number> = {};

    for (const row of groups) {
      const status = row.status as string;
      const count = row._count.id;
      const amount = row._sum.totalAmount ?? 0n;

      countsByStatus[status] = (countsByStatus[status] ?? 0) + count;
      revenueByStatus[status] = (revenueByStatus[status] ?? 0n) + amount;

      if (status === OrderStatus.COMPLETED && row.paymentMethod) {
        const method = row.paymentMethod as string;
        if (!paymentMethodMap[method]) {
          paymentMethodMap[method] = { count: 0, total: 0n };
        }
        paymentMethodMap[method].count += count;
        paymentMethodMap[method].total += amount;
      }

      const orderType = row.orderType ?? 'UNKNOWN';
      orderTypeMap[orderType] = (orderTypeMap[orderType] ?? 0) + count;

      const orderSource = row.orderSource ?? 'UNKNOWN';
      orderSourceMap[orderSource] = (orderSourceMap[orderSource] ?? 0) + count;
    }

    const completedCount = countsByStatus[OrderStatus.COMPLETED] ?? 0;
    const cancelledCount = countsByStatus[OrderStatus.CANCELLED] ?? 0;
    const totalCount = Object.values(countsByStatus).reduce((a, b) => a + b, 0);
    const completedRevenue = revenueByStatus[OrderStatus.COMPLETED] ?? 0n;

    let pendingRevenue = 0n;
    for (const [status, amount] of Object.entries(revenueByStatus)) {
      if (status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED) {
        pendingRevenue += amount;
      }
    }

    const averageTicket = completedCount > 0
      ? completedRevenue / BigInt(completedCount)
      : 0n;

    const productIds = topProductRows.map((r) => r.productId);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    return {
      counts: {
        total: totalCount,
        created:    countsByStatus[OrderStatus.CREATED]    ?? 0,
        confirmed:  countsByStatus[OrderStatus.CONFIRMED]  ?? 0,
        processing: countsByStatus[OrderStatus.PROCESSING] ?? 0,
        served:     countsByStatus[OrderStatus.SERVED]     ?? 0,
        completed:  completedCount,
        cancelled:  cancelledCount,
        pending:    totalCount - completedCount - cancelledCount,
      },
      revenue: {
        completed: completedRevenue,
        pending:   pendingRevenue,
        averageTicket,
      },
      byPaymentMethod: Object.entries(paymentMethodMap).map(([method, val]) => ({
        method, count: val.count, total: val.total,
      })),
      byOrderType:   Object.entries(orderTypeMap).map(([type, count])     => ({ type, count })),
      byOrderSource: Object.entries(orderSourceMap).map(([source, count]) => ({ source, count })),
      topProducts: topProductRows.map((r) => ({
        id:       r.productId,
        name:     nameMap[r.productId] ?? 'Producto',
        quantity: r._sum.quantity ?? 0,
        total:    r._sum.subtotal ?? 0n,
      })),
    };
  }
}
```

- [ ] **Step 2: Verificar que todos los unit tests pasan**

```bash
docker compose exec res-api-core pnpm test cash-register-stats.service.spec
```

Resultado esperado: los 9 tests pasan.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register-stats.service.ts
git commit -m "feat(cash-register): implement CashRegisterStatsService.getStats()"
```

---

### Task 5: Crear `CashShiftStatsSerializer`

**Files:**
- Create: `apps/api-core/src/cash-register/serializers/cash-register-stats.serializer.ts`
- Modify: `apps/api-core/src/cash-register/dto/cash-register-response.dto.ts`

- [ ] **Step 1: Crear el archivo del serializer**

```typescript
// apps/api-core/src/cash-register/serializers/cash-register-stats.serializer.ts
import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { fromCents } from '../../common/helpers/money';
import { ShiftStats, emptyShiftStats } from '../cash-register-stats.service';

@Exclude()
export class StatsCountsSerializer {
  @Expose() @ApiProperty() total: number;
  @Expose() @ApiProperty() created: number;
  @Expose() @ApiProperty() confirmed: number;
  @Expose() @ApiProperty() processing: number;
  @Expose() @ApiProperty() served: number;
  @Expose() @ApiProperty() completed: number;
  @Expose() @ApiProperty() cancelled: number;
  @Expose() @ApiProperty() pending: number;

  constructor(partial: Partial<StatsCountsSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsRevenueSerializer {
  @Expose() @ApiProperty() completed: number;
  @Expose() @ApiProperty() pending: number;
  @Expose() @ApiProperty() averageTicket: number;

  constructor(partial: Partial<StatsRevenueSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsByPaymentMethodSerializer {
  @Expose() @ApiProperty() method: string;
  @Expose() @ApiProperty() count: number;
  @Expose() @ApiProperty() total: number;

  constructor(partial: Partial<StatsByPaymentMethodSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsByOrderTypeSerializer {
  @Expose() @ApiProperty() type: string;
  @Expose() @ApiProperty() count: number;

  constructor(partial: Partial<StatsByOrderTypeSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsByOrderSourceSerializer {
  @Expose() @ApiProperty() source: string;
  @Expose() @ApiProperty() count: number;

  constructor(partial: Partial<StatsByOrderSourceSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class StatsTopProductSerializer {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() name: string;
  @Expose() @ApiProperty() quantity: number;
  @Expose() @ApiProperty() total: number;

  constructor(partial: Partial<StatsTopProductSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class CashShiftStatsSerializer {
  @Expose()
  @ApiProperty({ type: StatsCountsSerializer })
  @Type(() => StatsCountsSerializer)
  counts: StatsCountsSerializer;

  @Expose()
  @ApiProperty({ type: StatsRevenueSerializer })
  @Type(() => StatsRevenueSerializer)
  revenue: StatsRevenueSerializer;

  @Expose()
  @ApiProperty({ type: [StatsByPaymentMethodSerializer] })
  @Type(() => StatsByPaymentMethodSerializer)
  byPaymentMethod: StatsByPaymentMethodSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsByOrderTypeSerializer] })
  @Type(() => StatsByOrderTypeSerializer)
  byOrderType: StatsByOrderTypeSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsByOrderSourceSerializer] })
  @Type(() => StatsByOrderSourceSerializer)
  byOrderSource: StatsByOrderSourceSerializer[];

  @Expose()
  @ApiProperty({ type: [StatsTopProductSerializer] })
  @Type(() => StatsTopProductSerializer)
  topProducts: StatsTopProductSerializer[];

  constructor(stats: ShiftStats) {
    this.counts = new StatsCountsSerializer(stats.counts);
    this.revenue = new StatsRevenueSerializer({
      completed:     fromCents(stats.revenue.completed),
      pending:       fromCents(stats.revenue.pending),
      averageTicket: fromCents(stats.revenue.averageTicket),
    });
    this.byPaymentMethod = stats.byPaymentMethod.map(
      (x) => new StatsByPaymentMethodSerializer({ method: x.method, count: x.count, total: fromCents(x.total) }),
    );
    this.byOrderType   = stats.byOrderType.map((x)   => new StatsByOrderTypeSerializer(x));
    this.byOrderSource = stats.byOrderSource.map((x) => new StatsByOrderSourceSerializer(x));
    this.topProducts   = stats.topProducts.map(
      (x) => new StatsTopProductSerializer({ id: x.id, name: x.name, quantity: x.quantity, total: fromCents(x.total) }),
    );
  }

  static empty(): CashShiftStatsSerializer {
    return new CashShiftStatsSerializer(emptyShiftStats());
  }
}
```

- [ ] **Step 2: Agregar DTOs Swagger al final de `cash-register-response.dto.ts`**

Abrir `apps/api-core/src/cash-register/dto/cash-register-response.dto.ts` y agregar al final del archivo (después de `SessionSummaryResponseDto`):

```typescript
export class StatsCountsDto {
  @ApiProperty() total: number;
  @ApiProperty() created: number;
  @ApiProperty() confirmed: number;
  @ApiProperty() processing: number;
  @ApiProperty() served: number;
  @ApiProperty() completed: number;
  @ApiProperty() cancelled: number;
  @ApiProperty() pending: number;
}

export class StatsRevenueDto {
  @ApiProperty() completed: number;
  @ApiProperty() pending: number;
  @ApiProperty() averageTicket: number;
}

export class StatsByPaymentMethodDto {
  @ApiProperty() method: string;
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class StatsByOrderTypeDto {
  @ApiProperty() type: string;
  @ApiProperty() count: number;
}

export class StatsByOrderSourceDto {
  @ApiProperty() source: string;
  @ApiProperty() count: number;
}

export class StatsTopProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() total: number;
}

export class CashShiftStatsResponseDto {
  @ApiProperty({ type: StatsCountsDto })          counts: StatsCountsDto;
  @ApiProperty({ type: StatsRevenueDto })          revenue: StatsRevenueDto;
  @ApiProperty({ type: [StatsByPaymentMethodDto] }) byPaymentMethod: StatsByPaymentMethodDto[];
  @ApiProperty({ type: [StatsByOrderTypeDto] })     byOrderType: StatsByOrderTypeDto[];
  @ApiProperty({ type: [StatsByOrderSourceDto] })   byOrderSource: StatsByOrderSourceDto[];
  @ApiProperty({ type: [StatsTopProductDto] })      topProducts: StatsTopProductDto[];
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/serializers/cash-register-stats.serializer.ts \
        apps/api-core/src/cash-register/dto/cash-register-response.dto.ts
git commit -m "feat(cash-register): add CashShiftStatsSerializer with class-transformer hierarchy"
```

---

### Task 6: Registrar servicio en módulo + agregar `GET /stats`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.module.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts`

- [ ] **Step 1: Registrar `CashRegisterStatsService` en el módulo**

En `apps/api-core/src/cash-register/cash-register.module.ts`:

```typescript
import { Module } from '@nestjs/common';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterStatsService } from './cash-register-stats.service';
import { CashRegisterController } from './cash-register.controller';
import { CashShiftModule } from '../cash-shift/cash-shift.module';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [CashShiftModule, OrdersModule, RestaurantsModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService, CashRegisterStatsService],
  exports: [CashRegisterService],
})
export class CashRegisterModule {}
```

- [ ] **Step 2: Inyectar `CashRegisterStatsService` en el controller y agregar el endpoint**

En `apps/api-core/src/cash-register/cash-register.controller.ts`, agregar los imports:

```typescript
import { CashRegisterStatsService } from './cash-register-stats.service';
import { CashShiftStatsSerializer } from './serializers/cash-register-stats.serializer';
import { CashShiftStatsResponseDto } from './dto/cash-register-response.dto';
```

Actualizar el constructor del controller para inyectar `CashRegisterStatsService`:

```typescript
constructor(
  private readonly registerService: CashRegisterService,
  private readonly statsService: CashRegisterStatsService,
  private readonly timezoneService: TimezoneService,
) {}
```

Agregar el endpoint `GET /stats` **antes** del endpoint `GET /current` (para evitar que NestJS interprete `stats` como un `:sessionId`):

```typescript
@Get('stats')
@Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
@ApiOperation({ summary: 'Estadísticas en vivo de la sesión de caja activa' })
@ApiResponse({ status: 200, type: CashShiftStatsResponseDto })
@ApiResponse({ status: 401, description: 'No autenticado' })
async stats(@CurrentUser() user: { restaurantId: string }) {
  const session = await this.registerService.getCurrentSession(user.restaurantId);
  if (!('id' in session)) {
    return CashShiftStatsSerializer.empty();
  }
  const stats = await this.statsService.getStats(
    (session as any).id,
    user.restaurantId,
  );
  return new CashShiftStatsSerializer(stats);
}
```

- [ ] **Step 3: Ejecutar la suite de unit tests para verificar que no hay regresiones**

```bash
docker compose exec res-api-core pnpm test
```

Resultado esperado: todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.module.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts
git commit -m "feat(cash-register): add GET /stats endpoint accessible by all roles"
```

---

### Task 7: E2E tests para `GET /stats`

**Files:**
- Create: `apps/api-core/test/cash-register/cashRegisterStats.e2e-spec.ts`

- [ ] **Step 1: Crear el archivo de spec E2E**

```typescript
// apps/api-core/test/cash-register/cashRegisterStats.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

describe('GET /v1/cash-register/stats (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    const rest = await seedRestaurant(prisma, 'NoAuth');
    const token = await login(app, rest.admin.email);
    await openCashShiftViaApi(app, token);

    await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .expect(401);
  });

  it('BASIC puede ver las stats', async () => {
    const rest = await seedRestaurant(prisma, 'BasicStats');
    const adminToken = await login(app, rest.admin.email);
    const basicToken = await login(app, rest.basic.email);
    await openCashShiftViaApi(app, adminToken);

    await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);
  });

  it('Sin sesión abierta retorna zeros (no error)', async () => {
    const rest = await seedRestaurant(prisma, 'NoShift');
    const token = await login(app, rest.admin.email);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.counts.total).toBe(0);
    expect(res.body.counts.pending).toBe(0);
    expect(res.body.revenue.completed).toBe(0);
    expect(res.body.revenue.averageTicket).toBe(0);
    expect(res.body.topProducts).toEqual([]);
    expect(res.body.byPaymentMethod).toEqual([]);
  });

  it('Retorna todos los campos requeridos con una sesión abierta', async () => {
    const rest = await seedRestaurant(prisma, 'FullFields');
    const token = await login(app, rest.admin.email);
    await openCashShiftViaApi(app, token);

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      counts: {
        total:      expect.any(Number),
        created:    expect.any(Number),
        confirmed:  expect.any(Number),
        processing: expect.any(Number),
        served:     expect.any(Number),
        completed:  expect.any(Number),
        cancelled:  expect.any(Number),
        pending:    expect.any(Number),
      },
      revenue: {
        completed:    expect.any(Number),
        pending:      expect.any(Number),
        averageTicket: expect.any(Number),
      },
      byPaymentMethod: expect.any(Array),
      byOrderType:     expect.any(Array),
      byOrderSource:   expect.any(Array),
      topProducts:     expect.any(Array),
    });
  });

  it('counts.pending = total - completed - cancelled', async () => {
    const rest = await seedRestaurant(prisma, 'PendingCalc');
    const token  = await login(app, rest.admin.email);
    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shiftId = await openCashShiftViaApi(app, token);

    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CREATED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CANCELLED');

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { counts } = res.body;
    expect(counts.total).toBe(3);
    expect(counts.completed).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.pending).toBe(counts.total - counts.completed - counts.cancelled);
  });

  it('revenue.completed solo cuenta órdenes COMPLETED', async () => {
    const rest = await seedRestaurant(prisma, 'RevenueCalc');
    const token  = await login(app, rest.admin.email);
    const product = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
    const shiftId = await openCashShiftViaApi(app, token);

    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CANCELLED');
    await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, product.id, 'CREATED');

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // product price = 1000 centavos = 10.0; solo 1 COMPLETED
    expect(res.body.revenue.completed).toBe(10);
    // pending = 1 CREATED = 10.0; CANCELLED excluida
    expect(res.body.revenue.pending).toBe(10);
  });

  it('topProducts tiene máximo 5 elementos', async () => {
    const rest = await seedRestaurant(prisma, 'TopProds');
    const token  = await login(app, rest.admin.email);
    const shiftId = await openCashShiftViaApi(app, token);

    // Crear 6 productos distintos y un pedido COMPLETED para cada uno
    for (let i = 0; i < 6; i++) {
      const p = await seedProduct(prisma, rest.restaurant.id, rest.category.id);
      await seedOrderOnShift(prisma, rest.restaurant.id, shiftId, p.id, 'COMPLETED');
    }

    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.topProducts.length).toBeLessThanOrEqual(5);
  });

  it('aislamiento por restaurante — no mezcla stats de otro restaurante', async () => {
    const restA = await seedRestaurant(prisma, 'IsoA');
    const restB = await seedRestaurant(prisma, 'IsoB');
    const tokenA = await login(app, restA.admin.email);
    const tokenB = await login(app, restB.admin.email);
    const productA = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shiftAId = await openCashShiftViaApi(app, tokenA);
    await openCashShiftViaApi(app, tokenB);

    // Solo RestA tiene órdenes
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftAId, productA.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftAId, productA.id, 'COMPLETED');

    const resB = await request(app.getHttpServer())
      .get('/v1/cash-register/stats')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // RestB no tiene órdenes — sus stats deben estar en cero
    expect(resB.body.counts.total).toBe(0);
    expect(resB.body.revenue.completed).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar los tests E2E**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=cashRegisterStats
```

Resultado esperado: todos los tests pasan.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/cash-register/cashRegisterStats.e2e-spec.ts
git commit -m "test(cash-register): add e2e tests for GET /stats endpoint"
```

---

### Task 8: Refactorizar `closeSession` para usar `CashRegisterStatsService`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts`

- [ ] **Step 1: Inyectar `CashRegisterStatsService` en `CashRegisterService`**

En `cash-register.service.ts`, agregar el import:

```typescript
import { CashRegisterStatsService } from './cash-register-stats.service';
```

Actualizar el constructor:

```typescript
constructor(
  private readonly registerSessionRepository: CashShiftRepository,
  private readonly orderRepository: OrderRepository,
  private readonly prisma: PrismaService,
  private readonly statsService: CashRegisterStatsService,
) {}
```

- [ ] **Step 2: Refactorizar `closeSession`**

Reemplazar el método `closeSession` completo. La transacción ahora solo cierra la sesión y guarda los totales en el registro de `CashShift`. Los stats completos se obtienen después de la transacción via `statsService.getStats`:

```typescript
async closeSession(restaurantId: string, closedBy?: string) {
  const closedSession = await this.prisma.$transaction(async (tx) => {
    const session = await tx.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
    });
    if (!session) throw new NoOpenCashRegisterException();

    const pendingCount = await tx.order.count({
      where: {
        cashShiftId: session.id,
        status: {
          in: [
            OrderStatus.CREATED,
            OrderStatus.CONFIRMED,
            OrderStatus.PROCESSING,
            OrderStatus.SERVED,
          ],
        },
      },
    });
    if (pendingCount > 0) throw new PendingOrdersException(pendingCount);

    const agg = await tx.order.aggregate({
      where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    return tx.cashShift.update({
      where: { id: session.id },
      data: {
        status: CashShiftStatus.CLOSED,
        closedAt: new Date(),
        closedBy,
        totalSales:  agg._sum.totalAmount ?? 0n,
        totalOrders: agg._count.id,
      },
    });
  });

  const stats = await this.statsService.getStats(closedSession.id, restaurantId);
  return { session: closedSession, stats };
}
```

- [ ] **Step 3: Actualizar el endpoint `close` en el controller**

En `cash-register.controller.ts`, reemplazar el método `close`:

```typescript
@Post('close')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Cerrar sesión de caja activa' })
@ApiResponse({ status: 200, description: 'Sesión cerrada con estadísticas completas' })
@ApiResponse({ status: 409, description: 'No hay sesión de caja abierta o hay pedidos pendientes' })
@ApiResponse({ status: 401, description: 'No autenticado' })
@ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
async close(@CurrentUser() user: { restaurantId: string; id: string }) {
  const [result, tz] = await Promise.all([
    this.registerService.closeSession(user.restaurantId, user.id),
    this.timezoneService.getTimezone(user.restaurantId),
  ]);
  return {
    session: new CashShiftSerializer(result.session, tz),
    stats:   new CashShiftStatsSerializer(result.stats),
  };
}
```

- [ ] **Step 4: Ejecutar E2E de cierre de sesión y verificar que pasan**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=closeSession
```

El response cambió de `{ session, summary }` a `{ session, stats }`. Si los tests existentes verifican `res.body.summary`, actualizarlos para verificar `res.body.stats` con la nueva estructura `CashShiftStatsResponseDto`.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts
git commit -m "feat(cash-register): refactor closeSession to use CashRegisterStatsService"
```

---

### Task 9: Refactorizar `/summary` y `/top-products` + limpiar código viejo

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts`
- Delete: `apps/api-core/src/cash-register/serializers/session-summary.serializer.ts`

- [ ] **Step 1: Agregar `getSessionStats` y eliminar métodos obsoletos en `CashRegisterService`**

En `cash-register.service.ts`:

1. Agregar el nuevo método `getSessionStats`:

```typescript
async getSessionStats(sessionId: string, restaurantId: string) {
  const [stats, session] = await Promise.all([
    this.statsService.getStats(sessionId, restaurantId),
    this.registerSessionRepository.findById(sessionId),
  ]);
  return { session: session!, stats };
}
```

2. Eliminar completamente los métodos `getSessionSummary` y `getTopProducts`.

- [ ] **Step 2: Actualizar el controller para `/summary/:sessionId` y `/top-products/:sessionId`**

En `cash-register.controller.ts`, eliminar los imports de `serializeSessionSummary`, `serializeTopProducts` y `session-summary.serializer`. Luego actualizar los dos endpoints:

```typescript
@Get('summary/:sessionId')
@ApiOperation({ summary: 'Estadísticas completas de una sesión de caja' })
@ApiParam({ name: 'sessionId', type: String })
@ApiResponse({ status: 200, type: CashShiftStatsResponseDto })
@ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
@ApiResponse({ status: 401, description: 'No autenticado' })
@ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
async summary(
  @CurrentUser() user: { restaurantId: string },
  @Param('sessionId') sessionId: string,
) {
  const [result, tz] = await Promise.all([
    this.registerService.getSessionStats(sessionId, user.restaurantId),
    this.timezoneService.getTimezone(user.restaurantId),
  ]);
  return {
    session: new CashShiftSerializer(result.session, tz),
    stats:   new CashShiftStatsSerializer(result.stats),
  };
}

@Get('top-products/:sessionId')
@ApiOperation({ summary: 'Top 5 productos más vendidos de una sesión' })
@ApiParam({ name: 'sessionId', type: String })
@ApiResponse({ status: 200, type: TopProductsResponseDto })
@ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
@ApiResponse({ status: 401, description: 'No autenticado' })
@ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
async topProducts(
  @CurrentUser() user: { restaurantId: string },
  @Param('sessionId') sessionId: string,
) {
  const stats = await this.statsService.getStats(sessionId, user.restaurantId);
  const serialized = new CashShiftStatsSerializer(stats);
  return { topProducts: serialized.topProducts };
}
```

- [ ] **Step 3: Eliminar `session-summary.serializer.ts`**

```bash
rm apps/api-core/src/cash-register/serializers/session-summary.serializer.ts
```

Verificar que no queden imports de ese archivo en ningún otro archivo:

```bash
grep -r "session-summary.serializer" apps/api-core/src
```

Resultado esperado: sin resultados.

- [ ] **Step 4: Ejecutar la suite completa de E2E**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=cash-register
```

Si los tests de `sessionSummary.e2e-spec.ts` fallan porque verifican `res.body.summary`, actualizarlos para verificar `res.body.stats` con la nueva estructura.

- [ ] **Step 5: Ejecutar todos los unit tests**

```bash
docker compose exec res-api-core pnpm test
```

Resultado esperado: todos los tests pasan.

- [ ] **Step 6: Commit final**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts
git rm apps/api-core/src/cash-register/serializers/session-summary.serializer.ts
git commit -m "feat(cash-register): delegate summary and top-products to CashRegisterStatsService; remove old serializer"
```
