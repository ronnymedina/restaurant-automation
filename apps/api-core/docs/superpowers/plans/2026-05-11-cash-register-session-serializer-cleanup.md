# Cash Register Session Serializer Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpiar el serializer de `CashShift`, cambiar `paymentBreakdown` a array, agregar timezone en fechas, y simplificar el summary de sesión a `{ completed, cancelled, paymentBreakdown }`.

**Architecture:** Los cambios son en cascada: backend primero (serializer → service → controller → DTOs → e2e tests), luego frontend (tipos → render). Cada tarea es independiente excepto que la tarea de controller depende de la tarea del serializer.

**Tech Stack:** NestJS, Prisma, class-transformer, TypeScript, React (Astro island)

---

## File Map

| Archivo | Cambio |
|---------|--------|
| `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts` | Eliminar campos expuestos; agregar `displayOpenedAt`/`displayClosedAt` con timezone en constructor |
| `apps/api-core/src/cash-register/serializers/session-summary.serializer.ts` | `serializePaymentBreakdown` → array; `serializeSessionSummary` → `{ completed, cancelled, paymentBreakdown }` |
| `apps/api-core/src/cash-register/dto/cash-register-response.dto.ts` | Reemplazar `OrdersByStatusDto`/`totalSales`/`totalOrders` con `CompletedGroupDto`/`CancelledGroupDto`; `paymentBreakdown` como array |
| `apps/api-core/src/cash-register/cash-register.service.ts` | `getSessionSummary` → derivar `completed`/`cancelled`; eliminar `ordersByStatus`, `totalSales`, `totalOrders` |
| `apps/api-core/src/cash-register/cash-register.module.ts` | Importar `RestaurantsModule` |
| `apps/api-core/src/cash-register/cash-register.controller.ts` | Inyectar `TimezoneService`; pasar `tz` a cada `new CashShiftSerializer(...)` |
| `apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts` | Actualizar assertions para nuevo shape |
| `apps/api-core/test/cash-register/closeSession.e2e-spec.ts` | Actualizar assertions para `paymentBreakdown` array |
| `apps/ui/src/components/dash/register/api.ts` | Reescribir `CashShiftDto`; actualizar `PaymentMethodInfo` → `PaymentBreakdownItem`; `SessionDetailSummary` nuevo shape |
| `apps/ui/src/components/dash/register/RegisterHistoryIsland.tsx` | Usar `displayOpenedAt`/`displayClosedAt`; eliminar columna `totalSales`; 2-card stats; iterar array `paymentBreakdown`; eliminar timezone state |

---

## Task 1: Reescribir `CashShiftSerializer`

**Files:**
- Modify: `apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts`

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar el contenido con:

```ts
import { CashShift, CashShiftStatus } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CashShiftWithUser } from '../cash-register-session.repository';

@Exclude()
export class CashShiftSerializer implements Pick<CashShift, 'id' | 'status'> {
  @ApiProperty()
  @Expose()
  id: string;

  // not exposed: restaurantId, userId, lastOrderNumber, openingBalance, totalSales, totalOrders
  restaurantId: string;
  userId: string;
  lastOrderNumber: number;
  openingBalance: bigint;
  totalSales: bigint | null;
  totalOrders: number | null;
  openedAt: Date;
  closedAt: Date | null;

  @ApiProperty({ enum: CashShiftStatus })
  @Expose()
  status: CashShiftStatus;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedBy: string | null;

  @ApiProperty()
  @Expose()
  displayOpenedAt: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  displayClosedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  openedByEmail: string | null;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  _count?: { orders: number };

  constructor(
    partial: Partial<CashShiftWithUser & { _count?: { orders: number } }>,
    timezone = 'UTC',
  ) {
    Object.assign(this, partial);
    const fmt = new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    this.displayOpenedAt = fmt.format(new Date(partial.openedAt!));
    this.displayClosedAt = partial.closedAt ? fmt.format(new Date(partial.closedAt)) : null;
    this.openedByEmail = (partial as any).user?.email ?? null;
  }
}
```

- [ ] **Step 2: Verificar que compila (type-check)**

```bash
docker compose exec res-api-core pnpm tsc --noEmit 2>&1 | head -40
```

Expected: errores sólo en archivos que aún usan los campos eliminados (controller, tests). Si hay errores en el serializer mismo, corregirlos antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/serializers/cash-shift.serializer.ts
git commit -m "refactor(cash-register): rewrite CashShiftSerializer — remove stale fields, add displayOpenedAt/displayClosedAt with timezone"
```

---

## Task 2: Actualizar `session-summary.serializer.ts`

**Files:**
- Modify: `apps/api-core/src/cash-register/serializers/session-summary.serializer.ts`

- [ ] **Step 1: Reemplazar el contenido del archivo**

```ts
import { fromCents } from '../../common/helpers/money';

export interface PaymentBreakdownItem {
  method: string;
  count: number;
  total: number;
}

function serializePaymentBreakdown(
  breakdown: Record<string, { count: number; total: bigint }>,
): PaymentBreakdownItem[] {
  return Object.entries(breakdown).map(([method, val]) => ({
    method,
    count: val.count,
    total: fromCents(val.total),
  }));
}

export function serializeSessionSummary(summary: {
  completed: { count: number; total: bigint };
  cancelled: { count: number };
  paymentBreakdown: Record<string, { count: number; total: bigint }>;
}) {
  return {
    completed: { count: summary.completed.count, total: fromCents(summary.completed.total) },
    cancelled: { count: summary.cancelled.count },
    paymentBreakdown: serializePaymentBreakdown(summary.paymentBreakdown),
  };
}

export function serializeTopProducts(topProducts: Array<{
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}>) {
  return topProducts.map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    total: fromCents(p.total),
  }));
}
```

- [ ] **Step 2: Verificar type-check**

```bash
docker compose exec res-api-core pnpm tsc --noEmit 2>&1 | grep "session-summary" | head -20
```

Expected: 0 errores en este archivo.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/serializers/session-summary.serializer.ts
git commit -m "refactor(cash-register): serializePaymentBreakdown → array; serializeSessionSummary → {completed, cancelled, paymentBreakdown}"
```

---

## Task 3: Actualizar DTOs de respuesta

**Files:**
- Modify: `apps/api-core/src/cash-register/dto/cash-register-response.dto.ts`

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```ts
import { ApiProperty } from '@nestjs/swagger';

export class PaymentBreakdownItemDto {
  @ApiProperty() method: string;
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class SessionSummaryDto {
  @ApiProperty() totalOrders: number;
  @ApiProperty() totalSales: number;
  @ApiProperty({ type: [PaymentBreakdownItemDto] }) paymentBreakdown: PaymentBreakdownItemDto[];
}

export class CompletedGroupDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class CancelledGroupDto {
  @ApiProperty() count: number;
}

export class NewSessionSummaryDto {
  @ApiProperty({ type: CompletedGroupDto }) completed: CompletedGroupDto;
  @ApiProperty({ type: CancelledGroupDto }) cancelled: CancelledGroupDto;
  @ApiProperty({ type: [PaymentBreakdownItemDto] }) paymentBreakdown: PaymentBreakdownItemDto[];
}

export class CashShiftDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() displayOpenedAt: string;
  @ApiProperty({ required: false, nullable: true }) displayClosedAt: string | null;
  @ApiProperty({ required: false, nullable: true }) closedBy: string | null;
  @ApiProperty({ required: false, nullable: true }) openedByEmail: string | null;
}

export class CloseSessionResponseDto {
  @ApiProperty({ type: CashShiftDto }) session: CashShiftDto;
  @ApiProperty({ type: SessionSummaryDto }) summary: SessionSummaryDto;
}

export class TopProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() total: number;
}

export class TopProductsResponseDto {
  @ApiProperty({ type: [TopProductDto] }) topProducts: TopProductDto[];
}

export class SessionSummaryResponseDto {
  @ApiProperty({ type: CashShiftDto }) session: CashShiftDto;
  @ApiProperty({ type: NewSessionSummaryDto }) summary: NewSessionSummaryDto;
}
```

- [ ] **Step 2: Verificar type-check**

```bash
docker compose exec res-api-core pnpm tsc --noEmit 2>&1 | grep "cash-register-response" | head -20
```

Expected: 0 errores en este archivo.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/dto/cash-register-response.dto.ts
git commit -m "refactor(cash-register): update response DTOs — PaymentBreakdownItemDto array, CompletedGroupDto/CancelledGroupDto, remove stale fields"
```

---

## Task 4: Actualizar `cash-register.service.ts` — `getSessionSummary`

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts`

- [ ] **Step 1: Reemplazar el método `getSessionSummary` completo**

Ubicar en el archivo la función `getSessionSummary` (líneas 141-200) y reemplazarla con:

```ts
async getSessionSummary(sessionId: string) {
  const session = await this.registerSessionRepository.findById(sessionId);
  if (!session) throw new CashRegisterNotFoundException(sessionId);

  const [statusGroups, paymentGroups] = await Promise.all([
    this.prisma.order.groupBy({
      by: ['status'],
      where: { cashShiftId: session.id },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    this.prisma.order.groupBy({
      by: ['paymentMethod'],
      where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
  ]);

  const completedGroup = statusGroups.find((g) => g.status === OrderStatus.COMPLETED);
  const cancelledGroup = statusGroups.find((g) => g.status === OrderStatus.CANCELLED);

  const completed = {
    count: completedGroup?._count.id ?? 0,
    total: completedGroup?._sum.totalAmount ?? 0n,
  };
  const cancelled = {
    count: cancelledGroup?._count.id ?? 0,
  };

  const paymentBreakdown: Record<string, { count: number; total: bigint }> = {};
  for (const g of paymentGroups) {
    const method = g.paymentMethod ?? 'UNKNOWN';
    paymentBreakdown[method] = {
      count: g._count.id,
      total: g._sum.totalAmount ?? 0n,
    };
  }

  return {
    session,
    summary: { completed, cancelled, paymentBreakdown },
  };
}
```

También eliminar del import la variable `fromCents` si ya no se usa directamente en el servicio (la función `closeSession` aún la usa, así que la dejamos).

- [ ] **Step 2: Verificar type-check en el servicio**

```bash
docker compose exec res-api-core pnpm tsc --noEmit 2>&1 | grep "cash-register.service" | head -20
```

Expected: 0 errores en este archivo.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.service.ts
git commit -m "refactor(cash-register): getSessionSummary returns {completed, cancelled, paymentBreakdown} — remove ordersByStatus, totalSales, totalOrders"
```

---

## Task 5: Importar `RestaurantsModule` e inyectar `TimezoneService` en el controller

**Files:**
- Modify: `apps/api-core/src/cash-register/cash-register.module.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.controller.ts`

- [ ] **Step 1: Actualizar `cash-register.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';
import { CashShiftRepository } from './cash-register-session.repository';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [OrdersModule, RestaurantsModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService, CashShiftRepository],
  exports: [CashRegisterService, CashShiftRepository],
})
export class CashRegisterModule {}
```

- [ ] **Step 2: Actualizar `cash-register.controller.ts` — inyectar `TimezoneService` y pasar `tz`**

Reemplazar el contenido completo con:

```ts
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CashRegisterService } from './cash-register.service';
import { TimezoneService } from '../restaurants/timezone.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CashShiftSerializer } from './serializers/cash-shift.serializer';
import { PaginatedCashShiftsSerializer } from './serializers/paginated-cash-shifts.serializer';
import {
  CloseSessionResponseDto,
  SessionSummaryResponseDto,
  TopProductsResponseDto,
} from './dto/cash-register-response.dto';
import {
  serializeSessionSummary,
  serializeTopProducts,
} from './serializers/session-summary.serializer';

@ApiTags('Cash Register')
@ApiBearerAuth()
@Controller({ version: '1', path: 'cash-register' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class CashRegisterController {
  constructor(
    private readonly registerService: CashRegisterService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir sesión de caja' })
  @ApiResponse({ status: 201, description: 'Sesión creada exitosamente', type: CashShiftSerializer })
  @ApiResponse({ status: 409, description: 'Ya existe una sesión de caja abierta (CASH_REGISTER_ALREADY_OPEN)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async open(@CurrentUser() user: { restaurantId: string; id: string }) {
    const [session, tz] = await Promise.all([
      this.registerService.openSession(user.restaurantId, user.id),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return new CashShiftSerializer(session, tz);
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión de caja activa' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada con resumen de ventas', type: CloseSessionResponseDto })
  @ApiResponse({ status: 409, description: 'No hay sesión de caja abierta (NO_OPEN_CASH_REGISTER)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async close(@CurrentUser() user: { restaurantId: string; id: string }) {
    const [result, tz] = await Promise.all([
      this.registerService.closeSession(user.restaurantId, user.id),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return {
      session: new CashShiftSerializer(result.session, tz),
      summary: {
        totalOrders: result.summary.totalOrders,
        totalSales: result.summary.totalSales,
        paymentBreakdown: result.summary.paymentBreakdown,
      },
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial paginado de sesiones de caja' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: PaginatedCashShiftsSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async history(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    const [result, tz] = await Promise.all([
      this.registerService.getSessionHistory(user.restaurantId, query.page, query.limit),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return new PaginatedCashShiftsSerializer({
      data: result.data.map((s) => new CashShiftSerializer(s, tz)),
      meta: result.meta,
    });
  }

  @Get('current')
  @ApiOperation({ summary: 'Sesión de caja actualmente abierta' })
  @ApiResponse({ status: 200, type: CashShiftSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async current(@CurrentUser() user: { restaurantId: string }) {
    const [session, tz] = await Promise.all([
      this.registerService.getCurrentSession(user.restaurantId),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    if (!('id' in session)) return {};
    return new CashShiftSerializer(session as any, tz);
  }

  @Get('summary/:sessionId')
  @ApiOperation({ summary: 'Resumen detallado de una sesión de caja' })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiResponse({ status: 200, type: SessionSummaryResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async summary(
    @CurrentUser() user: { restaurantId: string },
    @Param('sessionId') sessionId: string,
  ) {
    const [result, tz] = await Promise.all([
      this.registerService.getSessionSummary(sessionId),
      this.timezoneService.getTimezone(user.restaurantId),
    ]);
    return {
      session: new CashShiftSerializer(result.session, tz),
      summary: serializeSessionSummary(result.summary),
    };
  }

  @Get('top-products/:sessionId')
  @ApiOperation({ summary: 'Top 5 productos más vendidos de una sesión' })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiResponse({ status: 200, type: TopProductsResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada (CASH_REGISTER_NOT_FOUND)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async topProducts(@Param('sessionId') sessionId: string) {
    const result = await this.registerService.getTopProducts(sessionId);
    return { topProducts: serializeTopProducts(result.topProducts) };
  }
}
```

Nota: el endpoint `summary/:sessionId` ahora recibe `@CurrentUser()` para poder obtener el `restaurantId` y llamar a `timezoneService.getTimezone`. Esto es necesario porque `getSessionSummary` recibe un `sessionId`, no un `restaurantId` directamente. La alternativa sería buscar el `restaurantId` desde el session, pero agregar `@CurrentUser()` es más limpio.

- [ ] **Step 3: Verificar que compila**

```bash
docker compose exec res-api-core pnpm tsc --noEmit 2>&1 | head -40
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/cash-register/cash-register.module.ts apps/api-core/src/cash-register/cash-register.controller.ts
git commit -m "feat(cash-register): inject TimezoneService, pass timezone to CashShiftSerializer on all endpoints"
```

---

## Task 6: Actualizar e2e tests — `sessionSummary.e2e-spec.ts`

**Files:**
- Modify: `apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts`

Los tests actuales verifican `ordersByStatus`, `totalSales` y `totalOrders` — todo lo que el spec elimina. Reemplazarlos con assertions para el nuevo shape `{ completed, cancelled, paymentBreakdown }`.

- [ ] **Step 1: Reemplazar el contenido completo del test**

```ts
// test/cash-register/sessionSummary.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShiftViaApi, seedOrderOnShift,
} from './cash-register.helpers';

describe('GET /v1/cash-register/summary/:sessionId - sessionSummary (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    basicToken = await login(app, restA.basic.email);
    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    shiftId = await openCashShiftViaApi(app, adminToken);
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'COMPLETED');
    await seedOrderOnShift(prisma, restA.restaurant.id, shiftId, product.id, 'CANCELLED');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(403);
  });

  it('Sesión inexistente → 404 REGISTER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cash-register/summary/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.code).toBe('REGISTER_NOT_FOUND');
  });

  it('Retorna session y summary', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe(shiftId);
    expect(res.body.summary).toBeDefined();
    expect(res.body.orders).toBeUndefined();
  });

  it('session expone displayOpenedAt como string, no expone restaurantId ni userId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { session } = res.body;
    expect(typeof session.displayOpenedAt).toBe('string');
    expect(session.openedAt).toBeUndefined();
    expect(session.restaurantId).toBeUndefined();
    expect(session.userId).toBeUndefined();
    expect(session.lastOrderNumber).toBeUndefined();
    expect(session.openingBalance).toBeUndefined();
    expect(session.totalSales).toBeUndefined();
    expect(session.totalOrders).toBeUndefined();
  });

  it('summary.completed refleja las órdenes COMPLETED', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { completed } = res.body.summary;
    expect(completed).toBeDefined();
    expect(completed.count).toBe(2);
    // 2 orders × 1000 centavos = 2000 centavos = 20 pesos
    expect(completed.total).toBeCloseTo(20, 2);
  });

  it('summary.cancelled refleja las órdenes CANCELLED (sin total)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { cancelled } = res.body.summary;
    expect(cancelled).toBeDefined();
    expect(cancelled.count).toBe(1);
    expect(cancelled.total).toBeUndefined();
  });

  it('summary.paymentBreakdown es un array con {method, count, total}', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { paymentBreakdown } = res.body.summary;
    expect(Array.isArray(paymentBreakdown)).toBe(true);
    for (const item of paymentBreakdown) {
      expect(typeof item.method).toBe('string');
      expect(typeof item.count).toBe('number');
      expect(typeof item.total).toBe('number');
    }
  });

  it('summary NO contiene ordersByStatus, totalSales ni totalOrders', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/cash-register/summary/${shiftId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary.ordersByStatus).toBeUndefined();
    expect(res.body.summary.totalSales).toBeUndefined();
    expect(res.body.summary.totalOrders).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr los e2e tests de sessionSummary**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern="sessionSummary"
```

Expected: todos los tests pasan (verde).

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/cash-register/sessionSummary.e2e-spec.ts
git commit -m "test(cash-register): update sessionSummary e2e for new summary shape {completed, cancelled, paymentBreakdown}"
```

---

## Task 7: Actualizar e2e tests — `closeSession.e2e-spec.ts`

**Files:**
- Modify: `apps/api-core/test/cash-register/closeSession.e2e-spec.ts`

El close sigue retornando `{ totalOrders, totalSales, paymentBreakdown }` pero ahora `paymentBreakdown` es un **array**. Hay que actualizar los assertions que iteren sobre este campo.

- [ ] **Step 1: Leer el archivo completo**

```bash
cat apps/api-core/test/cash-register/closeSession.e2e-spec.ts
```

- [ ] **Step 2: Buscar y actualizar assertions de `paymentBreakdown`**

Encontrar todos los lugares donde el test itera con `Object.entries(paymentBreakdown)` o accede como objeto (`paymentBreakdown.CASH`, etc.) y reemplazarlos para iterar como array:

```ts
// Antes (objeto):
expect(typeof res.body.summary.paymentBreakdown).toBe('object');
for (const [method, info] of Object.entries(res.body.summary.paymentBreakdown) as any[]) {
  expect(typeof info.count).toBe('number');
  expect(typeof info.total).toBe('number');
}

// Después (array):
expect(Array.isArray(res.body.summary.paymentBreakdown)).toBe(true);
for (const item of res.body.summary.paymentBreakdown) {
  expect(typeof item.method).toBe('string');
  expect(typeof item.count).toBe('number');
  expect(typeof item.total).toBe('number');
}
```

También verificar que `session.displayOpenedAt` es string y que `session.openedAt` es `undefined`:

```ts
it('session expone displayOpenedAt como string formateado', async () => {
  // ... obtener res ...
  expect(typeof res.body.session.displayOpenedAt).toBe('string');
  expect(res.body.session.openedAt).toBeUndefined();
  expect(res.body.session.restaurantId).toBeUndefined();
});
```

- [ ] **Step 3: Correr todos los e2e tests de closeSession**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern="closeSession"
```

Expected: todos pasan.

- [ ] **Step 4: Correr todos los e2e tests de cash-register**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern="cash-register"
```

Expected: todos pasan.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/test/cash-register/closeSession.e2e-spec.ts
git commit -m "test(cash-register): update closeSession e2e for array paymentBreakdown and displayOpenedAt"
```

---

## Task 8: Actualizar tipos y API en el frontend

**Files:**
- Modify: `apps/ui/src/components/dash/register/api.ts`

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```ts
import { apiFetch } from '../../../lib/api';

export const CASH_SHIFT_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type CashShiftStatus = (typeof CASH_SHIFT_STATUS)[keyof typeof CASH_SHIFT_STATUS];

export interface CashShiftDto {
  id: string;
  status: CashShiftStatus;
  displayOpenedAt: string;
  displayClosedAt: string | null;
  closedBy: string | null;
  openedByEmail: string | null;
  _count?: { orders: number };
  // removed: restaurantId, userId, lastOrderNumber, openingBalance,
  //          totalSales, totalOrders, openedAt, closedAt
}

export interface PaymentBreakdownItem {
  method: string;
  count: number;
  total: number;
}

export interface CloseSummary {
  totalOrders: number;
  totalSales: number;
  paymentBreakdown: PaymentBreakdownItem[];
}

export interface CloseSessionResult {
  session: CashShiftDto;
  summary: CloseSummary;
}

interface ApiError {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; httpStatus: number };

export async function getCurrentSession(): Promise<ApiResult<CashShiftDto | null>> {
  const res = await apiFetch('/v1/cash-register/current');
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  if (!data || !('id' in data)) return { ok: true, data: null };
  return { ok: true, data: data as CashShiftDto };
}

export async function openSession(): Promise<ApiResult<CashShiftDto>> {
  const res = await apiFetch('/v1/cash-register/open', { method: 'POST' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  return { ok: true, data: data as CashShiftDto };
}

export async function closeSession(): Promise<ApiResult<CloseSessionResult>> {
  const res = await apiFetch('/v1/cash-register/close', { method: 'POST' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  return { ok: true, data: data as CloseSessionResult };
}

export interface SessionHistoryMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SessionDetailSummary {
  completed: { count: number; total: number };
  cancelled: { count: number };
  paymentBreakdown: PaymentBreakdownItem[];
}

export interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  total: number;
}

export interface TopProductsResult {
  topProducts: TopProduct[];
}

export interface SessionDetail {
  session: CashShiftDto;
  summary: SessionDetailSummary;
}

export async function getSessionHistory(
  page: number,
  limit = 10,
): Promise<ApiResult<{ data: CashShiftDto[]; meta: SessionHistoryMeta }>> {
  const res = await apiFetch(`/v1/cash-register/history?page=${page}&limit=${limit}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function getSessionDetail(sessionId: string): Promise<ApiResult<SessionDetail>> {
  const res = await apiFetch(`/v1/cash-register/summary/${sessionId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function getTopProducts(sessionId: string): Promise<ApiResult<TopProductsResult>> {
  const res = await apiFetch(`/v1/cash-register/top-products/${sessionId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/register/api.ts
git commit -m "refactor(ui/register): update CashShiftDto, PaymentBreakdownItem array, SessionDetailSummary new shape"
```

---

## Task 9: Actualizar `RegisterHistoryIsland.tsx`

**Files:**
- Modify: `apps/ui/src/components/dash/register/RegisterHistoryIsland.tsx`

- [ ] **Step 1: Reemplazar el contenido completo del componente**

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import Table from '../../commons/Table';
import Modal from '../../commons/Modal';
import IconButton from '../../commons/icons/IconButton';
import {
  getSessionHistory,
  getSessionDetail,
  getTopProducts,
  type CashShiftDto,
  type SessionDetail,
  type TopProduct,
} from './api';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Billetera digital',
  SIN_METODO: 'Sin método de pago',
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

export default function RegisterHistoryIsland() {
  const [sessions, setSessions] = useState<CashShiftDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [listError, setListError] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [detailError, setDetailError] = useState('');

  const loadHistory = useCallback(async (p: number) => {
    setIsLoading(true);
    setListError('');
    const result = await getSessionHistory(p);
    setIsLoading(false);
    if (!result.ok) {
      setListError(
        result.httpStatus === 403
          ? 'No tienes permisos para acceder a esta sección'
          : 'Error al cargar el historial',
      );
      return;
    }
    setSessions(result.data.data);
    setTotalPages(result.data.meta.totalPages);
    setPage(p);
  }, []);

  useEffect(() => {
    loadHistory(1);
  }, [loadHistory]);

  async function openDetail(sessionId: string) {
    setDetail(null);
    setTopProducts([]);
    setDetailError('');
    setDetailLoading(true);
    setDetailOpen(true);
    const [detailResult, topResult] = await Promise.all([
      getSessionDetail(sessionId),
      getTopProducts(sessionId),
    ]);
    setDetailLoading(false);
    if (!detailResult.ok) {
      setDetailError('Error al cargar el detalle');
      return;
    }
    setDetail(detailResult.data);
    if (topResult.ok) setTopProducts(topResult.data.topProducts);
  }

  const columns = useMemo<ColumnDef<CashShiftDto>[]>(
    () => [
      {
        accessorKey: 'displayOpenedAt',
        header: 'Fecha apertura',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'displayClosedAt',
        header: 'Fecha cierre',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{getValue<string | null>() ?? '—'}</span>
        ),
      },
      {
        id: 'status',
        header: 'Estado',
        cell: ({ row }) => {
          const isOpen = row.original.status === 'OPEN';
          return (
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}
            >
              {isOpen ? 'Abierta' : 'Cerrada'}
            </span>
          );
        },
      },
      {
        id: 'orders',
        header: 'Pedidos',
        cell: ({ row }) => row.original._count?.orders ?? 0,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <IconButton
            icon="eye"
            label="Ver detalle"
            variant="primary"
            onClick={() => openDetail(row.original.id)}
          />
        ),
      },
    ],
    [],
  );

  function renderDetailContent() {
    if (detailLoading) {
      return <p className="text-center text-slate-400 py-8">Cargando...</p>;
    }
    if (detailError) {
      return <p className="text-center text-red-400">{detailError}</p>;
    }
    if (!detail) return null;

    const { session, summary } = detail;

    return (
      <div className="space-y-5">
        <div className="text-sm text-slate-500 space-y-0.5">
          <p>
            Apertura:{' '}
            <span className="text-slate-700 font-medium">{session.displayOpenedAt}</span>
          </p>
          <p>
            Cierre:{' '}
            <span className="text-slate-700 font-medium">{session.displayClosedAt ?? '—'}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-lg p-4 text-center">
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(summary.completed.total)}</p>
            <p className="text-sm text-emerald-600">{summary.completed.count} pedidos completados</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <p className="text-lg font-bold text-red-600">{summary.cancelled.count}</p>
            <p className="text-sm text-red-500">pedidos cancelados</p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Desglose por método de pago</h4>
          <div className="bg-slate-50 rounded-lg px-4 py-2">
            {summary.paymentBreakdown.length === 0 ? (
              <p className="text-slate-400 text-sm py-1">Sin pedidos</p>
            ) : (
              summary.paymentBreakdown.map((item) => (
                <div
                  key={item.method}
                  className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="text-slate-600">{PAYMENT_LABELS[item.method] ?? item.method}</span>
                  <span className="text-slate-800 font-medium">
                    {item.count} pedidos &mdash; {formatCurrency(item.total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Platillos más vendidos</h4>
          <div className="bg-slate-50 rounded-lg px-4 py-2">
            {topProducts.length === 0 ? (
              <p className="text-slate-400 text-sm py-1">Sin datos de productos</p>
            ) : (
              topProducts.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-slate-700">{p.name}</span>
                  <span className="text-slate-500 text-sm">{p.quantity} uds.</span>
                  <span className="text-slate-800 font-medium ml-4">{formatCurrency(p.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-800">Historial de Caja</h2>

      {listError ? (
        <p className="text-red-400 text-center">{listError}</p>
      ) : (
        <Table
          columns={columns}
          data={sessions}
          isLoading={isLoading}
          emptyMessage="No hay sesiones de caja"
          pagination={totalPages > 1 ? { page, totalPages, onPageChange: loadHistory } : undefined}
        />
      )}

      <Modal
        open={detailOpen}
        title="Detalle de Sesión"
        onClose={() => setDetailOpen(false)}
        size="2xl"
      >
        {renderDetailContent()}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/register/RegisterHistoryIsland.tsx
git commit -m "feat(ui/register): use displayOpenedAt/displayClosedAt, 2-card stats, array paymentBreakdown, remove timezone state"
```

---

## Task 10: Verificación final

- [ ] **Step 1: Correr todos los e2e tests de cash-register**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern="cash-register"
```

Expected: todos pasan.

- [ ] **Step 2: Correr unit tests del módulo**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern="cash-register"
```

Expected: todos pasan (o confirmar que no hay unit tests que fallen por los cambios).

- [ ] **Step 3: Type-check completo del proyecto**

```bash
docker compose exec res-api-core pnpm tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Levantar el stack y verificar manualmente en el browser**

```bash
docker compose up -d
```

Abrir `http://localhost:4321/dash/register-history` y verificar:
- Columna "Fecha apertura" muestra `"7 may 2026, 22:44"` (o similar) — no UTC crudo.
- No hay columna "Total ventas" en la tabla.
- Modal de detalle muestra 2 cards (completados / cancelados), no 4.
- Desglose de pago funciona correctamente.
