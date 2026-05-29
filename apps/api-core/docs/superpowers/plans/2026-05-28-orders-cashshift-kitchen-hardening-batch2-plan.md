# Hardening Batch 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el bucket "Próximo sprint" del audit (H-07, H-08, H-11, H-12, H-15) en un único commit: validación de input en findHistory, defensa en profundidad por restaurantId en stats/reports, eliminación del método sin uso `CashShiftRepository.close()` y eliminación del feature `notifyOffline` (dead-end).

**Architecture:** TDD por hallazgo, dentro del contenedor Docker. Cada cambio empieza con su test rojo, luego implementación mínima, luego verde. El commit es uno solo al final del Task 6. Las firmas de servicio de cash-register cambian para aceptar `restaurantId` explícito — defensa en profundidad sobre el `CashShiftGuard` actual.

**Tech Stack:** NestJS 11, Prisma 6, class-validator, class-transformer, Jest, Supertest. Postgres en desarrollo. Tests dentro de `docker compose exec res-api-core`.

**Spec asociado:** `apps/api-core/docs/superpowers/specs/2026-05-28-orders-cashshift-kitchen-hardening-batch2-design.md`

---

## File Structure

**Nuevos:**
- `apps/api-core/src/orders/dto/find-history.dto.ts` — DTO validado para `GET /orders/history`
- `apps/api-core/src/orders/dto/validators/valid-date-range.validator.ts` — cross-field validator (`dateFrom <= dateTo`, rango ≤ 90 días)
- `apps/api-core/src/orders/dto/find-history.dto.spec.ts` — unit tests del DTO
- `apps/api-core/src/orders/order-shift-report.repository.spec.ts` — unit tests del filtro tenant

**Modificados (código):**
- `apps/api-core/src/orders/orders.controller.ts` — usar `FindHistoryDto`
- `apps/api-core/src/orders/order-shift-report.repository.ts` — aceptar `restaurantId`
- `apps/api-core/src/cash-register/cash-register-stats.service.ts` — `getSummary(restaurantId, sessionId)`
- `apps/api-core/src/cash-register/cash-register.service.ts` — `getSessionSummary(restaurantId, sessionId)` + 404
- `apps/api-core/src/cash-register/cash-register.controller.ts` — actualizar callers
- `apps/api-core/src/cash-shift/cash-shift.repository.ts` — eliminar `close()`
- `apps/api-core/src/kitchen/kitchen.controller.ts` — eliminar endpoint `notifyOffline`
- `apps/api-core/src/kitchen/kitchen.service.ts` — eliminar método `notifyOffline`
- `apps/ui/src/pages/kitchen/index.astro` — eliminar call a `/notify-offline`

**Modificados (tests):**
- `apps/api-core/src/cash-register/cash-register-stats.service.spec.ts` — añadir tenant tests
- `apps/api-core/src/cash-register/cash-register.service.spec.ts` — añadir 404 cross-tenant
- `apps/api-core/src/kitchen/kitchen.service.spec.ts` — eliminar `describe('notifyOffline', ...)`
- `apps/api-core/test/orders/orderHistory.e2e-spec.ts` — añadir validación rechazos
- `apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts` — añadir cross-tenant 404

**Modificados (docs):**
- `apps/api-core/src/orders/orders.module.info.md` — contrato `GET /history`
- `apps/api-core/src/cash-register/cash-register.module.info.md` — firmas con `restaurantId`
- `apps/api-core/src/kitchen/kitchen.module.info.md` — eliminar referencias `notify-offline`
- `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` — marcar 5 hallazgos como ✅

---

## Estrategia de commits

**Un único commit al final del plan**. No commitear entre tasks. La verificación intermedia se hace corriendo los tests específicos del cambio.

---

## Task 1: H-07 — `FindHistoryDto` con validación

**Files:**
- Create: `apps/api-core/src/orders/dto/validators/valid-date-range.validator.ts`
- Create: `apps/api-core/src/orders/dto/find-history.dto.ts`
- Create: `apps/api-core/src/orders/dto/find-history.dto.spec.ts`
- Modify: `apps/api-core/src/orders/orders.controller.ts:1-19, 77-103`
- Modify: `apps/api-core/test/orders/orderHistory.e2e-spec.ts` (añadir bloque de validación)

### Step 1.1: Crear el validator cross-field

- [ ] Crear `apps/api-core/src/orders/dto/validators/valid-date-range.validator.ts`:

```ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

const MAX_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@ValidatorConstraint({ name: 'ValidDateRange', async: false })
export class ValidDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as { dateFrom?: string; dateTo?: string };
    if (!obj.dateFrom || !obj.dateTo) return true;

    const from = Date.parse(obj.dateFrom);
    const to = Date.parse(obj.dateTo);
    if (Number.isNaN(from) || Number.isNaN(to)) return true; // @Matches se encarga

    if (from > to) return false;
    if ((to - from) / MS_PER_DAY > MAX_DAYS) return false;
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const obj = args.object as { dateFrom?: string; dateTo?: string };
    if (!obj.dateFrom || !obj.dateTo) return '';
    const from = Date.parse(obj.dateFrom);
    const to = Date.parse(obj.dateTo);
    if (from > to) return 'dateFrom debe ser menor o igual a dateTo';
    return `el rango de fechas no puede exceder ${MAX_DAYS} días`;
  }
}

export function ValidDateRange(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: ValidDateRangeConstraint,
    });
  };
}
```

### Step 1.2: Crear el DTO

- [ ] Crear `apps/api-core/src/orders/dto/find-history.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsOptional, Matches, Max, Min,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

import { ValidDateRange } from './validators/valid-date-range.validator';

export class FindHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orderNumber debe ser entero' })
  @Min(1, { message: 'orderNumber debe ser >= 1' })
  orderNumber?: number;

  @IsOptional()
  @IsEnum(OrderStatus, { message: 'status inválido' })
  status?: OrderStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom debe ser YYYY-MM-DD' })
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo debe ser YYYY-MM-DD' })
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser entero' })
  @Min(1, { message: 'page debe ser >= 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser entero' })
  @Min(1, { message: 'limit debe ser >= 1' })
  @Max(100, { message: 'limit no puede ser mayor a 100' })
  limit?: number;

  @ValidDateRange()
  private readonly _dateRangeCheck?: undefined;
}
```

### Step 1.3: Escribir el spec unitario del DTO (rojo)

- [ ] Crear `apps/api-core/src/orders/dto/find-history.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FindHistoryDto } from './find-history.dto';

async function findError<T extends object>(dto: T, property: string) {
  const errors = await validate(dto);
  return errors.find((e) => e.property === property);
}

async function findCrossFieldError<T extends object>(dto: T) {
  const errors = await validate(dto);
  return errors.find((e) => e.property === '_dateRangeCheck');
}

describe('FindHistoryDto', () => {
  describe('orderNumber', () => {
    it('acepta valor válido', async () => {
      const dto = plainToInstance(FindHistoryDto, { orderNumber: '5' });
      expect(await findError(dto, 'orderNumber')).toBeUndefined();
    });

    it('rechaza no-numérico', async () => {
      const dto = plainToInstance(FindHistoryDto, { orderNumber: 'abc' });
      expect(await findError(dto, 'orderNumber')).toBeDefined();
    });

    it('rechaza valor < 1', async () => {
      const dto = plainToInstance(FindHistoryDto, { orderNumber: '0' });
      expect(await findError(dto, 'orderNumber')).toBeDefined();
    });
  });

  describe('status', () => {
    it('acepta valor del enum', async () => {
      const dto = plainToInstance(FindHistoryDto, { status: 'COMPLETED' });
      expect(await findError(dto, 'status')).toBeUndefined();
    });

    it('rechaza valor fuera del enum', async () => {
      const dto = plainToInstance(FindHistoryDto, { status: 'BLAH' });
      expect(await findError(dto, 'status')).toBeDefined();
    });
  });

  describe('dateFrom / dateTo formato', () => {
    it('acepta YYYY-MM-DD', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-15' });
      expect(await findError(dto, 'dateFrom')).toBeUndefined();
    });

    it('rechaza ISO con hora', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-15T12:00:00Z' });
      expect(await findError(dto, 'dateFrom')).toBeDefined();
    });

    it('rechaza texto libre', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateTo: 'hoy' });
      expect(await findError(dto, 'dateTo')).toBeDefined();
    });
  });

  describe('rango de fechas', () => {
    it('acepta rango válido < 90d', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-01', dateTo: '2026-01-15' });
      expect(await findCrossFieldError(dto)).toBeUndefined();
    });

    it('rechaza dateFrom > dateTo', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-02-01', dateTo: '2026-01-01' });
      expect(await findCrossFieldError(dto)).toBeDefined();
    });

    it('rechaza rango > 90 días', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-01', dateTo: '2026-12-31' });
      expect(await findCrossFieldError(dto)).toBeDefined();
    });

    it('acepta solo dateFrom (sin tope)', async () => {
      const dto = plainToInstance(FindHistoryDto, { dateFrom: '2026-01-01' });
      expect(await findCrossFieldError(dto)).toBeUndefined();
    });
  });

  describe('limit / page', () => {
    it('acepta limit=100', async () => {
      const dto = plainToInstance(FindHistoryDto, { limit: '100' });
      expect(await findError(dto, 'limit')).toBeUndefined();
    });

    it('rechaza limit=101', async () => {
      const dto = plainToInstance(FindHistoryDto, { limit: '101' });
      expect(await findError(dto, 'limit')).toBeDefined();
    });

    it('rechaza limit no-numérico', async () => {
      const dto = plainToInstance(FindHistoryDto, { limit: 'abc' });
      expect(await findError(dto, 'limit')).toBeDefined();
    });

    it('rechaza page=0', async () => {
      const dto = plainToInstance(FindHistoryDto, { page: '0' });
      expect(await findError(dto, 'page')).toBeDefined();
    });
  });

  it('caso completo válido pasa sin errores', async () => {
    const dto = plainToInstance(FindHistoryDto, {
      orderNumber: '5', status: 'COMPLETED',
      dateFrom: '2026-01-01', dateTo: '2026-01-31',
      page: '1', limit: '20',
    });
    expect(await validate(dto)).toEqual([]);
  });
});
```

### Step 1.4: Correr el spec (verde — el DTO ya está implementado en 1.2)

- [ ] Run: `docker compose exec res-api-core pnpm test -- find-history.dto.spec`

Expected: todos los tests del DTO en verde (16 cases).

### Step 1.5: Cambiar el controller para usar el DTO

- [ ] Modificar `apps/api-core/src/orders/orders.controller.ts`:

Imports — cambiar:
```ts
import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
```
por:
```ts
import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { FindHistoryDto } from './dto/find-history.dto';
```

Reemplazar el bloque (líneas 86-103) `async findHistory(...)`:
```ts
  async findHistory(
    @CurrentUser() user: { restaurantId: string },
    @Query('orderNumber') orderNumber?: string,
    @Query('status') status?: OrderStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ordersService.findHistory(user.restaurantId, {
      orderNumber: orderNumber ? parseInt(orderNumber, 10) : undefined,
      status,
      dateFrom,
      dateTo,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }
```
por:
```ts
  async findHistory(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: FindHistoryDto,
  ) {
    return this.ordersService.findHistory(user.restaurantId, {
      orderNumber: query.orderNumber,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }
```

### Step 1.6: Añadir casos e2e de validación al spec existente

- [ ] Modificar `apps/api-core/test/orders/orderHistory.e2e-spec.ts`. Antes del `afterAll(...)`, añadir un nuevo bloque:

```ts
  describe('Validación de query params (H-07)', () => {
    it('rechaza limit no-numérico con 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?limit=abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rechaza limit > 100 con 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?limit=999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rechaza dateFrom no-ISO con 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?dateFrom=hoy')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rechaza dateFrom > dateTo con 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?dateFrom=2026-02-01&dateTo=2026-01-01')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rechaza rango > 90 días con 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?dateFrom=2026-01-01&dateTo=2026-06-30')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rechaza status fuera del enum con 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?status=BLAH')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rechaza orderNumber no-numérico con 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?orderNumber=abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('acepta query válida con 200', async () => {
      await request(app.getHttpServer())
        .get('/v1/orders/history?dateFrom=2026-01-01&dateTo=2026-01-31&limit=10&page=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
```

### Step 1.7: Correr todo el suite de orders unit + e2e

- [ ] Run unit: `docker compose exec res-api-core pnpm test -- orders`

Expected: en verde, incluyendo el nuevo `find-history.dto.spec.ts`.

- [ ] Run e2e: `docker compose exec res-api-core pnpm test:e2e -- orderHistory`

Expected: todos en verde, incluido el nuevo bloque "Validación de query params (H-07)".

**Verificación de control:** confirmar que el suite de orders sigue verde y se añadieron al menos 8 casos nuevos al e2e (los del describe nuevo).

---

## Task 2: H-08 — `OrderShiftReportRepository` filtrar por `restaurantId`

**Files:**
- Create: `apps/api-core/src/orders/order-shift-report.repository.spec.ts`
- Modify: `apps/api-core/src/orders/order-shift-report.repository.ts:34-68`

### Step 2.1: Escribir el spec unitario (rojo)

- [ ] Crear `apps/api-core/src/orders/order-shift-report.repository.spec.ts`:

```ts
import { OrderShiftReportRepository } from './order-shift-report.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('OrderShiftReportRepository — restaurantId filter (H-08)', () => {
  let repo: OrderShiftReportRepository;
  let prisma: { order: { groupBy: jest.Mock }; orderItem: { groupBy: jest.Mock }; product: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      order: { groupBy: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    repo = new OrderShiftReportRepository(prisma as unknown as PrismaService);
  });

  describe('groupOrdersByShift', () => {
    it('aplica restaurantId al where', async () => {
      await repo.groupOrdersByShift('rest-A', 'shift-1');
      expect(prisma.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cashShiftId: 'shift-1', cashShift: { restaurantId: 'rest-A' } },
        }),
      );
    });
  });

  describe('getTopProductsWithNamesByShift', () => {
    it('aplica restaurantId al where del orderItem groupBy', async () => {
      await repo.getTopProductsWithNamesByShift('rest-A', 'shift-1');
      expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            order: expect.objectContaining({
              cashShiftId: 'shift-1',
              cashShift: { restaurantId: 'rest-A' },
            }),
          }),
        }),
      );
    });

    it('aplica restaurantId al lookup de nombres de producto', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantity: 3, subtotal: 1000n } },
      ]);
      await repo.getTopProductsWithNamesByShift('rest-A', 'shift-1');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['p1'] }, restaurantId: 'rest-A' },
        }),
      );
    });
  });
});
```

### Step 2.2: Correr el spec — esperar fallo

- [ ] Run: `docker compose exec res-api-core pnpm test -- order-shift-report.repository.spec`

Expected: FAIL (`restaurantId` no se está pasando todavía).

### Step 2.3: Implementar el cambio en el repositorio

- [ ] Modificar `apps/api-core/src/orders/order-shift-report.repository.ts:34-68`:

Reemplazar el método `groupOrdersByShift`:
```ts
  groupOrdersByShift(sessionId: string): Promise<OrderGroupRow[]> {
    return this.prisma.order.groupBy({
      by: [status, paymentMethod, orderType, orderSource],
      where: { cashShiftId: sessionId },
      _sum: { totalAmount: true },
      _count: { id: true },
    }) as unknown as Promise<OrderGroupRow[]>;
  }
```
por:
```ts
  groupOrdersByShift(restaurantId: string, sessionId: string): Promise<OrderGroupRow[]> {
    return this.prisma.order.groupBy({
      by: [status, paymentMethod, orderType, orderSource],
      where: { cashShiftId: sessionId, cashShift: { restaurantId } },
      _sum: { totalAmount: true },
      _count: { id: true },
    }) as unknown as Promise<OrderGroupRow[]>;
  }
```

Reemplazar el método `getTopProductsWithNamesByShift`:
```ts
  async getTopProductsWithNamesByShift(sessionId: string, take = 5): Promise<TopProductWithName[]> {
    const rows = await this.prisma.orderItem.groupBy({
      by: [productId],
      where: { order: { cashShiftId: sessionId, status: { not: OrderStatus.CANCELLED } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    }) as unknown as TopProductRow[];

    if (rows.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, name: true },
    });

    
    const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    return rows.map((r) => ({
      id: r.productId,
      name: nameMap[r.productId] ?? 'Producto',
      quantity: r._sum.quantity ?? 0,
      total: r._sum.subtotal ?? 0n,
    }));
  }
```
por:
```ts
  async getTopProductsWithNamesByShift(
    restaurantId: string,
    sessionId: string,
    take = 5,
  ): Promise<TopProductWithName[]> {
    const rows = await this.prisma.orderItem.groupBy({
      by: [productId],
      where: {
        order: {
          cashShiftId: sessionId,
          cashShift: { restaurantId },
          status: { not: OrderStatus.CANCELLED },
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    }) as unknown as TopProductRow[];

    if (rows.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) }, restaurantId },
      select: { id: true, name: true },
    });

    const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    return rows.map((r) => ({
      id: r.productId,
      name: nameMap[r.productId] ?? 'Producto',
      quantity: r._sum.quantity ?? 0,
      total: r._sum.subtotal ?? 0n,
    }));
  }
```

### Step 2.4: Correr el spec — debe pasar

- [ ] Run: `docker compose exec res-api-core pnpm test -- order-shift-report.repository.spec`

Expected: 3 tests en verde.

**Nota:** El cambio rompe los callers (`cash-register-stats.service.ts`). Eso se arregla en Task 3. Si corres el suite completo ahora, fallará. Es esperado.

---

## Task 3: H-12 — `getSummary` con `restaurantId` + 404 cross-tenant

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register-stats.service.ts:47-50`
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts:78, 119-125`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts:80, 119-122, 147-159, 169-175`
- Modify: `apps/api-core/src/cash-register/cash-register-stats.service.spec.ts` (añadir tests tenant)
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts` (añadir test 404)
- Modify: `apps/api-core/src/cash-register/cash-register.controller.spec.ts` (actualizar callers mockeados)
- Modify: `apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts` (cross-tenant e2e)

### Step 3.1: Actualizar `CashRegisterStatsService.getSummary` y su spec

- [ ] Modificar `apps/api-core/src/cash-register/cash-register-stats.service.ts:47-67`:

Reemplazar:
```ts
  async getSummary(sessionId: string): Promise<ShiftSummary> {
    const [groups, topProducts] = await Promise.all([
      this.orderShiftReport.groupOrdersByShift(sessionId),
      this.orderShiftReport.getTopProductsWithNamesByShift(sessionId),
    ]);
```
por:
```ts
  async getSummary(restaurantId: string, sessionId: string): Promise<ShiftSummary> {
    const [groups, topProducts] = await Promise.all([
      this.orderShiftReport.groupOrdersByShift(restaurantId, sessionId),
      this.orderShiftReport.getTopProductsWithNamesByShift(restaurantId, sessionId),
    ]);
```

- [ ] Modificar `apps/api-core/src/cash-register/cash-register-stats.service.spec.ts` para que todos los `getSummary('shift-id')` pasen a `getSummary('rest-id', 'shift-id')`. Buscar todos los call sites en el archivo y añadir el `restaurantId` como primer argumento (usar `'rest-1'` o el id mock que ya use el archivo).

Además, añadir al final del archivo (antes del último `});`):
```ts
  describe('tenant filter (H-12)', () => {
    it('propaga restaurantId al orderShiftReport', async () => {
      // Asume que `orderShiftReportMock` o equivalente existe en el spec.
      // Si no, instanciar repo mock con jest.fn() y verificar la propagación.
      const groupByMock = jest.fn().mockResolvedValue([]);
      const topMock = jest.fn().mockResolvedValue([]);
      const service = new CashRegisterStatsService({
        groupOrdersByShift: groupByMock,
        getTopProductsWithNamesByShift: topMock,
      } as any);
      await service.getSummary('rest-A', 'shift-1');
      expect(groupByMock).toHaveBeenCalledWith('rest-A', 'shift-1');
      expect(topMock).toHaveBeenCalledWith('rest-A', 'shift-1');
    });
  });
```

**Nota al implementador:** si el spec existente usa otra forma de instanciar el service (TestingModule), seguir ese patrón y solo asegurar el assert del primer argumento.

### Step 3.2: Correr el spec de stats service

- [ ] Run: `docker compose exec res-api-core pnpm test -- cash-register-stats.service.spec`

Expected: en verde, incluyendo el test nuevo `tenant filter (H-12)`.

### Step 3.3: Actualizar `CashRegisterService.getSessionSummary` con 404

- [ ] Modificar `apps/api-core/src/cash-register/cash-register.service.ts:78`:

Reemplazar:
```ts
    const summary = await this.statsService.getSummary(closedSession.id);
```
por:
```ts
    const summary = await this.statsService.getSummary(restaurantId, closedSession.id);
```

- [ ] Modificar `apps/api-core/src/cash-register/cash-register.service.ts:119-125`:

Reemplazar:
```ts
  async getSessionSummary(sessionId: string) {
    const [summary, session] = await Promise.all([
      this.statsService.getSummary(sessionId),
      this.registerSessionRepository.findById(sessionId),
    ]);
    return { session: session!, summary };
  }
```
por:
```ts
  async getSessionSummary(restaurantId: string, sessionId: string) {
    const session = await this.registerSessionRepository.findById(sessionId);
    if (!session || session.restaurantId !== restaurantId) {
      throw new CashRegisterNotFoundException();
    }
    const summary = await this.statsService.getSummary(restaurantId, sessionId);
    return { session, summary };
  }
```

### Step 3.4: Añadir tests al cash-register.service.spec

- [ ] Modificar `apps/api-core/src/cash-register/cash-register.service.spec.ts`. Localizar el describe de `getSessionSummary` (o si no existe, crear uno) y añadir:

```ts
  describe('getSessionSummary — cross-tenant 404 (H-12)', () => {
    it('lanza CashRegisterNotFoundException si la sesión pertenece a otro restaurante', async () => {
      const otherRestSession = {
        id: 'shift-1',
        restaurantId: 'rest-OTRO',
        userId: 'u1',
        status: 'CLOSED' as const,
      };
      // Ajustar al mock real de findById usado en el spec:
      (registerSessionRepositoryMock.findById as jest.Mock).mockResolvedValue(otherRestSession);

      await expect(service.getSessionSummary('rest-A', 'shift-1')).rejects.toThrow(
        CashRegisterNotFoundException,
      );
    });

    it('lanza CashRegisterNotFoundException si no existe la sesión', async () => {
      (registerSessionRepositoryMock.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.getSessionSummary('rest-A', 'shift-999')).rejects.toThrow(
        CashRegisterNotFoundException,
      );
    });
  });
```

**Nota al implementador:** ajustar el nombre del mock (`registerSessionRepositoryMock`, `cashShiftRepoMock`, etc.) al que ya use el archivo. Importar `CashRegisterNotFoundException` desde `./exceptions/cash-register.exceptions` si no está importado.

Adicionalmente, buscar el bloque que tenga `getSessionStats(` o `getSessionSummary(` con un solo argumento y actualizar la llamada a dos argumentos.

### Step 3.5: Actualizar callers del controller

- [ ] Modificar `apps/api-core/src/cash-register/cash-register.controller.ts`:

Línea ~120 (endpoint `/stats`):
```ts
    const summary = await this.statsService.getSummary(sessionId);
```
→
```ts
    const summary = await this.statsService.getSummary(user.restaurantId, sessionId);
```

Línea ~152 (endpoint `/summary/:sessionId`):
```ts
      this.registerService.getSessionSummary(req.cashShift.id),
```
→
```ts
      this.registerService.getSessionSummary(user.restaurantId, req.cashShift.id),
```

Línea ~172 (endpoint `/top-products/:sessionId`):
```ts
    const summary = await this.statsService.getSummary(req.cashShift.id);
```
→
```ts
    const summary = await this.statsService.getSummary(user.restaurantId, req.cashShift.id);
```

**Nota sobre `/top-products`:** este handler no recibe `user` hoy. Verificar el handler:
```ts
  async topProducts(
    @Req() req: Request & { cashShift: { id: string } },
  ) {
```
Añadir el parámetro:
```ts
  async topProducts(
    @CurrentUser() user: { restaurantId: string },
    @Req() req: Request & { cashShift: { id: string } },
  ) {
```

### Step 3.6: Actualizar el controller spec

- [ ] Modificar `apps/api-core/src/cash-register/cash-register.controller.spec.ts`: buscar todos los call sites mockeados de `getSummary(...)` y `getSessionSummary(...)` para que esperen el `restaurantId` como primer argumento. Buscar también los `mockResolvedValue` que devolvían formas antiguas y verificar que sigan siendo válidos.

### Step 3.7: Añadir e2e cross-tenant

- [ ] Modificar `apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts`. Añadir al final (antes del `afterAll`):

```ts
  describe('Cross-tenant (H-12)', () => {
    it('admin del restaurante A pidiendo summary de un sessionId del restaurante B recibe 404', async () => {
      // restA y restB ya están sembrados en beforeAll del spec existente; reusar.
      // Si el spec actual no tiene restB, sembrarlo aquí con seedRestaurant + openCashShift.
      const res = await request(app.getHttpServer())
        .get(`/v1/cash-register/summary/${otherTenantShiftId}`)
        .set('Authorization', `Bearer ${adminTokenA}`);
      expect(res.status).toBe(404);
    });
  });
```

**Nota al implementador:** inspeccionar el `beforeAll` del archivo. Si ya existe un `restB`, reusarlo. Si no, sembrar uno con `seedRestaurant(prisma, 'B')` + `openCashShift(...)` y guardar el shift id en `otherTenantShiftId`.

El comportamiento esperado: hoy el `CashShiftGuard` ya devuelve 404 cuando el sessionId no pertenece al tenant del JWT. Este e2e confirma que el comportamiento sigue siendo 404 después de la defensa en profundidad añadida.

### Step 3.8: Correr suite de cash-register

- [ ] Run: `docker compose exec res-api-core pnpm test -- cash-register`

Expected: todos en verde (unit + integration suites de cash-register).

- [ ] Run: `docker compose exec res-api-core pnpm test:e2e -- sessionSummary`

Expected: en verde, incluido el nuevo describe "Cross-tenant (H-12)".

---

## Task 4: H-11 — Eliminar `CashShiftRepository.close()`

**Files:**
- Modify: `apps/api-core/src/cash-shift/cash-shift.repository.ts:47-61`

### Step 4.1: Confirmar 0 callers

- [ ] Run: `grep -rn "cashShiftRepository\.close\|registerSessionRepository\.close" apps/api-core/src apps/api-core/test 2>/dev/null`

Expected: 0 resultados (solo definición). Si aparece algún caller no detectado en la exploración del spec, **detenerse y reportar** antes de eliminar el método.

### Step 4.2: Eliminar el método

- [ ] Modificar `apps/api-core/src/cash-shift/cash-shift.repository.ts`. Borrar las líneas 47-61 completas:

```ts
  async close(
    id: string,
    data: { totalSales: number; totalOrders: number; closedBy?: string },
  ): Promise<CashShift> {
    return this.prisma.cashShift.update({
      where: { id },
      data: {
        status: CashShiftStatus.CLOSED,
        closedAt: new Date(),
        totalSales: data.totalSales,
        totalOrders: data.totalOrders,
        closedBy: data.closedBy,
      },
    });
  }
```

### Step 4.3: Confirmar compilación

- [ ] Run: `docker compose exec res-api-core pnpm exec tsc --noEmit -p tsconfig.json`

Expected: 0 errores. (Si hay errores, indica que el grep del 4.1 perdió un caller — investigar.)

---

## Task 5: H-15 — Eliminar feature `notifyOffline`

**Files:**
- Modify: `apps/api-core/src/kitchen/kitchen.controller.ts:106-117` (eliminar endpoint)
- Modify: `apps/api-core/src/kitchen/kitchen.service.ts:82-84` (eliminar método)
- Modify: `apps/api-core/src/kitchen/kitchen.service.spec.ts:180-186` (eliminar describe)
- Modify: `apps/ui/src/pages/kitchen/index.astro:221-228` (eliminar fetch)

### Step 5.1: Eliminar el endpoint del controller

- [ ] Modificar `apps/api-core/src/kitchen/kitchen.controller.ts`. Borrar líneas 106-117 (el handler `notifyOffline` completo, incluyendo decoradores `@Post`, `@UseGuards`, `@ApiSecurity`, `@ApiOperation`, `@ApiParam`, `@ApiQuery`, `@ApiResponse`).

Bloque a borrar:
```ts
  @Post(':slug/notify-offline')
  @UseGuards(KitchenTokenGuard)
  @ApiSecurity('kitchen-token')
  @ApiOperation({ summary: 'Notificar al dashboard que la pantalla de cocina está offline' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiQuery({ name: 'token', required: true, description: 'Token de acceso de cocina' })
  @ApiResponse({ status: 201, description: 'Notificación emitida', schema: { example: { notified: true } } })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async notifyOffline(@Req() req: Request) {
    await this.kitchenService.notifyOffline((req as any)[KITCHEN_RESTAURANT_KEY]);
    return { notified: true };
  }
```

### Step 5.2: Eliminar el método del service

- [ ] Modificar `apps/api-core/src/kitchen/kitchen.service.ts`. Borrar líneas 82-84:

```ts
  async notifyOffline(restaurant: Restaurant) {
    this.sseService.emitToRestaurant(restaurant.id, 'kitchen:offline', {});
  }
```

### Step 5.3: Eliminar el test del service

- [ ] Modificar `apps/api-core/src/kitchen/kitchen.service.spec.ts`. Borrar el bloque `describe('notifyOffline', ...)` completo (líneas 180-186 aprox). Inspeccionar líneas vecinas para no romper la sintaxis del archivo.

### Step 5.4: Eliminar la llamada del frontend kitchen

- [ ] Modificar `apps/ui/src/pages/kitchen/index.astro`. Reemplazar la función `setOffline` (líneas 221-228):

```ts
  function setOffline() {
    connDot.style.background = '#f87171';
    offlineOverlay.style.display = 'flex';
    if (!notifiedOffline) {
      notifiedOffline = true;
      kitchenFetch(`/v1/kitchen/${slug}/notify-offline`, { method: 'POST' }).catch(() => {});
    }
  }
```
por:
```ts
  function setOffline() {
    connDot.style.background = '#f87171';
    offlineOverlay.style.display = 'flex';
  }
```

- [ ] Buscar y eliminar la variable `notifiedOffline` si queda sin uso:

```bash
grep -n "notifiedOffline" apps/ui/src/pages/kitchen/index.astro
```

Si aparece su declaración (`let notifiedOffline = false`) y su uso en `setOnline()` (`notifiedOffline = false`), eliminarlos también — son código muerto tras este cambio.

### Step 5.5: Verificar que no quedan referencias

- [ ] Run: `grep -rn "notify-offline\|notifyOffline" apps/ui/src apps/api-core/src apps/api-core/test 2>/dev/null`

Expected: 0 resultados.

### Step 5.6: Correr suite kitchen

- [ ] Run: `docker compose exec res-api-core pnpm test -- kitchen`

Expected: en verde (el `notifyOffline` describe ya no existe).

---

## Task 6: Documentación + audit + verificación final + commit

**Files:**
- Modify: `apps/api-core/src/orders/orders.module.info.md`
- Modify: `apps/api-core/src/cash-register/cash-register.module.info.md`
- Modify: `apps/api-core/src/kitchen/kitchen.module.info.md`
- Modify: `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`

### Step 6.1: Actualizar `orders.module.info.md`

- [ ] Localizar la sección que describe `GET /v1/orders/history`. Si no existe explícitamente, añadir esta nota cerca de la tabla de endpoints o en una subsección "Validación de query params":

```markdown
#### GET /v1/orders/history — query params (H-07)

- `orderNumber?: number` — entero ≥ 1
- `status?: OrderStatus` — enum válido (`CREATED|CONFIRMED|PROCESSING|SERVED|COMPLETED|CANCELLED`)
- `dateFrom?: string` — formato estricto `YYYY-MM-DD`
- `dateTo?: string` — formato estricto `YYYY-MM-DD`
- `page?: number` — entero ≥ 1 (default 1)
- `limit?: number` — entero 1–100 (default 20)

Reglas adicionales:
- `dateFrom <= dateTo` (cuando ambos están)
- Rango máximo: 90 días (cuando ambos están)

Errores: cualquier violación retorna `400 Bad Request` con mensajes de class-validator.

Montos en la respuesta: en pesos (no centavos). Ver `serializeOrder` en `order.repository.ts`.
```

### Step 6.2: Actualizar `cash-register.module.info.md`

- [ ] Localizar la sección de "Servicios" o "Métodos internos" y actualizar las firmas:

```markdown
- `CashRegisterStatsService.getSummary(restaurantId, sessionId)` — devuelve `ShiftSummary`. Filtra `cashShift.restaurantId` en la query base. Si el `sessionId` no pertenece al `restaurantId`, devuelve summary vacío (counts 0, revenue 0).
- `CashRegisterService.getSessionSummary(restaurantId, sessionId)` — valida que el `sessionId` pertenezca al `restaurantId`. Lanza `CashRegisterNotFoundException` (404) si no, o si la sesión no existe. **Defensa en profundidad** sobre `CashShiftGuard`.
```

### Step 6.3: Actualizar `kitchen.module.info.md`

- [ ] Eliminar la fila de la tabla de endpoints (línea ~65) que dice:

```markdown
| `POST` | `/v1/kitchen/:slug/notify-offline` | Kitchen token (query param) | — | `{ notified: true }` | Notifica que la pantalla está offline |
```

- [ ] Eliminar la sección completa "Notify Offline" (líneas 124-131 aprox), incluyendo el encabezado `#### Notify Offline — ...` y su tabla de casos.

### Step 6.4: Actualizar el audit doc

- [ ] Modificar `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`:

**Tabla resumen ejecutivo (líneas 25-31)**: cambiar la fila de ALTOS de:
```
| 🟠 ALTO    | 16 | H-05 ✅, H-06 ✅, H-09 ✅, H-13 ✅, H-14 ✅, H-07, H-08, H-10…H-12, H-15…H-20 |
```
a:
```
| 🟠 ALTO    | 16 | H-05 ✅, H-06 ✅, H-07 ✅, H-08 ✅, H-09 ✅, H-11 ✅, H-12 ✅, H-13 ✅, H-14 ✅, H-15 ✅, H-10, H-16…H-20 |
```

**Sección "Progreso"**: añadir línea después del `✅ H-05, H-06, H-09, H-13, H-14 implementados...`:
```
- ✅ H-07, H-08, H-11, H-12, H-15 implementados (2026-05-28) — FindHistoryDto con tope 90d/limit 100, defensa en profundidad por restaurantId en stats/reports, eliminación de CashShiftRepository.close (sin callers), eliminación del feature notifyOffline (dead-end sin listener UI). Ver `2026-05-28-orders-cashshift-kitchen-hardening-batch2-design.md`.
```

**Por hallazgo (H-07, H-08, H-11, H-12, H-15)**: añadir al final de cada bloque, antes del `---`:

Para H-07:
```markdown
**Estado:** ✅ Implementado (2026-05-28)
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`
```

Para H-08:
```markdown
**Estado:** ✅ Implementado (2026-05-28)
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`
```

Para H-11:
```markdown
**Estado:** ✅ Implementado (2026-05-28) — método eliminado (0 callers).
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`
```

Para H-12:
```markdown
**Estado:** ✅ Implementado (2026-05-28) — `getSummary(restaurantId, sessionId)` y `getSessionSummary(restaurantId, sessionId)` con validación explícita; 404 cross-tenant.
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`
```

Para H-15:
```markdown
**Estado:** ✅ Implementado (2026-05-28) — feature eliminado completo (endpoint + service method + spec + llamada UI). Diagnóstico revisado: el evento iba al canal correcto pero nadie tenía listener; se borra todo en vez de cablear listener UI nuevo (YAGNI).
**Plan asociado:** `docs/superpowers/plans/2026-05-28-orders-cashshift-kitchen-hardening-batch2-plan.md`
```

**Sección "Orden sugerido de remediación" (líneas 619-626)**: cambiar la fila "Próximo sprint" de:
```
| **Próximo sprint** | H-07 (findHistory DTO), H-11 (BigInt cash-shift), H-08/H-12 (filtros restaurantId), H-15 (notifyOffline canal) |
```
a:
```
| **Próximo sprint** | ~~H-07 (findHistory DTO)~~ ✅, ~~H-11 (BigInt cash-shift)~~ ✅, ~~H-08/H-12 (filtros restaurantId)~~ ✅, ~~H-15 (notifyOffline canal)~~ ✅ |
```

### Step 6.5: Verificación final — suite completo

- [ ] Run unit completo:

```bash
docker compose exec res-api-core pnpm test
```

Expected: todos los tests en verde. Si alguno falla, no continuar a 6.6. Diagnosticar y corregir.

- [ ] Run e2e completo:

```bash
docker compose exec res-api-core pnpm test:e2e
```

Expected: todos los tests e2e en verde (incluidos los nuevos de orderHistory y sessionSummary).

### Step 6.6: Verificación grep final

- [ ] Confirmar 0 referencias a feature eliminado:

```bash
grep -rn "notify-offline\|notifyOffline" apps/ui/src apps/api-core/src apps/api-core/test 2>/dev/null
```

Expected: 0 resultados.

- [ ] Confirmar 0 referencias al método borrado:

```bash
grep -rn "cashShiftRepository\.close\|registerSessionRepository\.close" apps/api-core/src apps/api-core/test 2>/dev/null
```

Expected: 0 resultados.

### Step 6.7: Commit único

- [ ] Run: `git status --short`

Verificar que todos los archivos modificados/creados están listados. No debe haber archivos espurios (`.DS_Store`, builds).

- [ ] Run staging selectivo (no `git add -A`):

```bash
git add apps/api-core/src/orders/dto/find-history.dto.ts \
        apps/api-core/src/orders/dto/find-history.dto.spec.ts \
        apps/api-core/src/orders/dto/validators/valid-date-range.validator.ts \
        apps/api-core/src/orders/orders.controller.ts \
        apps/api-core/src/orders/order-shift-report.repository.ts \
        apps/api-core/src/orders/order-shift-report.repository.spec.ts \
        apps/api-core/src/cash-register/cash-register-stats.service.ts \
        apps/api-core/src/cash-register/cash-register-stats.service.spec.ts \
        apps/api-core/src/cash-register/cash-register.service.ts \
        apps/api-core/src/cash-register/cash-register.service.spec.ts \
        apps/api-core/src/cash-register/cash-register.controller.ts \
        apps/api-core/src/cash-register/cash-register.controller.spec.ts \
        apps/api-core/src/cash-shift/cash-shift.repository.ts \
        apps/api-core/src/kitchen/kitchen.controller.ts \
        apps/api-core/src/kitchen/kitchen.service.ts \
        apps/api-core/src/kitchen/kitchen.service.spec.ts \
        apps/api-core/src/orders/orders.module.info.md \
        apps/api-core/src/cash-register/cash-register.module.info.md \
        apps/api-core/src/kitchen/kitchen.module.info.md \
        apps/api-core/test/orders/orderHistory.e2e-spec.ts \
        apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts \
        apps/ui/src/pages/kitchen/index.astro \
        apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md
```

- [ ] Crear el commit:

```bash
git commit -m "$(cat <<'EOF'
fix(api,ui): hardening batch 2 audit (H-07, H-08, H-11, H-12, H-15)

- H-07: FindHistoryDto valida orderNumber, status, dateFrom/dateTo
  (YYYY-MM-DD), page, limit (≤100) y rango ≤ 90 días. Reemplaza el
  parseo manual en el controller que generaba 500 opacos para input
  inválido y permitía rangos de fecha sin tope (DoS por count+findMany).
- H-08: OrderShiftReportRepository.groupOrdersByShift y
  getTopProductsWithNamesByShift aceptan restaurantId y filtran
  cashShift.restaurantId en la query base. Defensa en profundidad
  sobre el CashShiftGuard.
- H-11: eliminar CashShiftRepository.close() (sin callers, firma con
  totalSales: number violaba la convención BigInt — bomba latente).
- H-12: CashRegisterStatsService.getSummary y
  CashRegisterService.getSessionSummary reciben restaurantId. El
  service service valida pertenencia explícita y lanza
  CashRegisterNotFoundException (404) cross-tenant.
- H-15: eliminar feature notifyOffline completo (endpoint, service
  method, spec, llamada UI). Diagnóstico revisado: el evento iba al
  canal correcto pero nadie tenía listener — se borra en vez de
  cablear uno nuevo (YAGNI).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] Verificar:

```bash
git log --oneline -3
git status --short
```

Expected: el commit nuevo aparece en el log; `git status` muestra solo archivos no relacionados al cambio (los untracked previos del repo).

---

## Self-review checklist (completar antes de marcar el plan listo)

- [ ] Cada hallazgo del spec (H-07, H-08, H-11, H-12, H-15) tiene tareas asociadas ✅ (Task 1-5)
- [ ] Cada cambio tiene un test antes de implementar (TDD) ✅
- [ ] Las firmas de método son consistentes a lo largo del plan (`getSummary(restaurantId, sessionId)`, `groupOrdersByShift(restaurantId, sessionId)`, etc.) ✅
- [ ] La documentación está incluida (4 docs en Task 6) ✅
- [ ] El commit final es uno solo ✅
- [ ] Cero placeholders (sin TBD/TODO en el plan) ✅

---

## Verificación post-implementación (smoke test manual)

1. Levantar el stack: `docker compose up -d`
2. `GET /v1/orders/history?limit=abc` con bearer válido → 400 con mensaje de class-validator (no 500).
3. `GET /v1/orders/history?dateFrom=2024-01-01&dateTo=2026-12-31` → 400 con mensaje de rango.
4. Abrir `/dash/orders-history` y filtrar por fechas válidas → resultados correctos.
5. Abrir `/dash/register-history`, abrir modal de detalle de un turno cerrado → summary carga correctamente.
6. Abrir `/kitchen?slug=...&token=...`, simular desconexión (devtools offline) → overlay aparece sin error en consola.
7. Inspeccionar Network tab de la cocina → ya no se ve la request a `/notify-offline`.
