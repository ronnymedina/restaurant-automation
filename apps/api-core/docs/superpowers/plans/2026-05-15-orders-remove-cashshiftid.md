# Eliminar cashShiftId de GET /orders y extraer CashShiftModule

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar `cashShiftId` como parámetro del cliente en `GET /v1/orders` — el servidor lo resuelve internamente desde el JWT — y extraer `CashShiftRepository` a su propio módulo para eliminar el riesgo de dependencia circular.

**Architecture:** `CashShiftRepository` se mueve a `src/cash-shift/` con su propio módulo (`CashShiftModule`). `OrdersModule` y `KioskModule` importan `CashShiftModule` directamente. `CashRegisterModule` deja de exportar `CashShiftRepository`. `OrdersService.listOrders()` llama `CashShiftRepository.findOpen()` para resolver el turno activo; si no hay turno abierto lanza `RegisterNotOpenException` (409). El frontend elimina `cashShiftId` del payload de `getOrders()` y maneja el 409 seteando el estado a `CLOSED`.

**Tech Stack:** NestJS, Prisma, TypeScript, React (Preact/client islands), Vitest (frontend tests), Jest (backend tests)

---

### Task 1: Failing unit tests para OrdersService.listOrders()

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Agregar mock de CashShiftRepository y reescribir `describe('listOrders')`**

En `apps/api-core/src/orders/orders.service.spec.ts`:

1. Agregar al bloque de imports al principio del archivo (después de los otros imports):
```typescript
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
```

2. Agregar al bloque de mocks al principio del archivo:
```typescript
const mockCashShiftRepository = {
  findOpen: jest.fn(),
};
```

3. Agregar `{ provide: CashShiftRepository, useValue: mockCashShiftRepository }` a la lista de providers dentro de `Test.createTestingModule({ providers: [...] })`.

4. Reemplazar el bloque `describe('listOrders')` existente con:
```typescript
describe('listOrders', () => {
  it('throws RegisterNotOpenException when no shift is open', async () => {
    mockCashShiftRepository.findOpen.mockResolvedValue(null);
    await expect(service.listOrders('r1')).rejects.toThrow(RegisterNotOpenException);
  });

  it('calls orderRepository with the open shift id', async () => {
    const shift = { id: 'shift-1' };
    mockCashShiftRepository.findOpen.mockResolvedValue(shift);
    mockOrderRepository.listOrders.mockResolvedValue([]);
    await service.listOrders('r1');
    expect(mockOrderRepository.listOrders).toHaveBeenCalledWith(
      'r1', 'shift-1', undefined, undefined, undefined,
    );
  });

  it('passes statuses and limit to repository', async () => {
    const shift = { id: 'shift-1' };
    mockCashShiftRepository.findOpen.mockResolvedValue(shift);
    mockOrderRepository.listOrders.mockResolvedValue([]);
    await service.listOrders('r1', [OrderStatus.CREATED], 15);
    expect(mockOrderRepository.listOrders).toHaveBeenCalledWith(
      'r1', 'shift-1', [OrderStatus.CREATED], 15, undefined,
    );
  });

  it('passes multiple statuses to repository', async () => {
    const shift = { id: 'shift-1' };
    mockCashShiftRepository.findOpen.mockResolvedValue(shift);
    mockOrderRepository.listOrders.mockResolvedValue([]);
    await service.listOrders('r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100);
    expect(mockOrderRepository.listOrders).toHaveBeenCalledWith(
      'r1', 'shift-1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined,
    );
  });
});
```

5. Agregar `RegisterNotOpenException` a los imports de `./exceptions/orders.exceptions` (que ya están en el archivo).

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec res-api-core pnpm test -- orders.service.spec.ts --no-coverage
```

Expected: FAIL — "Cannot find module '../cash-shift/cash-shift.repository'" (módulo aún no existe).

- [ ] **Step 3: Commit tests (failing)**

```bash
git add apps/api-core/src/orders/orders.service.spec.ts
git commit -m "test(orders): update listOrders unit tests — remove cashShiftId, add RegisterNotOpenException case"
```

---

### Task 2: Extraer CashShiftModule

**Files:**
- Create: `apps/api-core/src/cash-shift/cash-shift.repository.ts`
- Create: `apps/api-core/src/cash-shift/cash-shift.module.ts`
- Delete: `apps/api-core/src/cash-register/cash-register-session.repository.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.module.ts`
- Modify: `apps/api-core/src/cash-register/cash-register.service.ts` (import path)
- Modify: `apps/api-core/src/cash-register/cash-register.service.spec.ts` (import path)
- Modify: `apps/api-core/src/kiosk/kiosk.service.ts` (import path)
- Modify: `apps/api-core/src/kiosk/kiosk.module.ts`
- Modify: `apps/api-core/src/orders/orders.module.ts`

- [ ] **Step 1: Crear `cash-shift.repository.ts`**

```typescript
// apps/api-core/src/cash-shift/cash-shift.repository.ts
import { Injectable } from '@nestjs/common';
import { CashShift, CashShiftStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type CashShiftWithUser = Prisma.CashShiftGetPayload<{
  include: { user: { select: { id: true; email: true } } };
}>;

export type CashShiftWithUserAndCount = Prisma.CashShiftGetPayload<{
  include: {
    user: { select: { id: true; email: true } };
    _count: { select: { orders: true } };
  };
}>;

export type CashShiftWithCount = Prisma.CashShiftGetPayload<{
  include: { _count: { select: { orders: true } } };
}>;

const USER_SELECT = { id: true, email: true } as const;

@Injectable()
export class CashShiftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string, userId: string): Promise<CashShiftWithUser> {
    return this.prisma.cashShift.create({
      data: { restaurantId, userId },
      include: { user: { select: USER_SELECT } },
    });
  }

  async findOpen(restaurantId: string): Promise<CashShift | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
    });
  }

  async findById(id: string): Promise<CashShiftWithUser | null> {
    return this.prisma.cashShift.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT } },
    });
  }

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

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: CashShiftWithCount[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.cashShift.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.cashShift.count({ where: { restaurantId } }),
    ]);
    return { data, total };
  }

  async findOpenWithOrderCount(restaurantId: string): Promise<CashShiftWithUserAndCount | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
      include: {
        _count: { select: { orders: true } },
        user: { select: USER_SELECT },
      },
    });
  }
}
```

- [ ] **Step 2: Crear `cash-shift.module.ts`**

```typescript
// apps/api-core/src/cash-shift/cash-shift.module.ts
import { Module } from '@nestjs/common';
import { CashShiftRepository } from './cash-shift.repository';

@Module({
  providers: [CashShiftRepository],
  exports: [CashShiftRepository],
})
export class CashShiftModule {}
```

- [ ] **Step 3: Actualizar `cash-register.module.ts`**

Reemplazar el contenido completo:

```typescript
// apps/api-core/src/cash-register/cash-register.module.ts
import { Module } from '@nestjs/common';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';
import { CashShiftModule } from '../cash-shift/cash-shift.module';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [CashShiftModule, OrdersModule, RestaurantsModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [CashRegisterService],
})
export class CashRegisterModule {}
```

Cambios: elimina `CashShiftRepository` de `providers` y `exports`, importa `CashShiftModule`.

- [ ] **Step 4: Actualizar import en `cash-register.service.ts`**

Cambiar la línea de import:
```typescript
// antes
import { CashShiftRepository, CashShiftWithUser, CashShiftWithCount } from './cash-register-session.repository';
// después
import { CashShiftRepository, CashShiftWithUser, CashShiftWithCount } from '../cash-shift/cash-shift.repository';
```

- [ ] **Step 5: Actualizar import en `cash-register.service.spec.ts`**

Cambiar la línea de import:
```typescript
// antes
import { CashShiftRepository } from './cash-register-session.repository';
// después
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
```

- [ ] **Step 6: Actualizar import en `kiosk.service.ts`**

Cambiar la línea de import:
```typescript
// antes
import { CashShiftRepository } from '../cash-register/cash-register-session.repository';
// después
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
```

- [ ] **Step 7: Actualizar `kiosk.module.ts`**

Agregar `CashShiftModule` a los imports (el módulo ya importa `CashRegisterModule`, pero éste ya no exporta `CashShiftRepository`):

```typescript
// apps/api-core/src/kiosk/kiosk.module.ts
import { Module } from '@nestjs/common';

import { KioskService } from './kiosk.service';
import { KioskController } from './kiosk.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { MenusModule } from '../menus/menus.module';
import { OrdersModule } from '../orders/orders.module';
import { CashRegisterModule } from '../cash-register/cash-register.module';
import { CashShiftModule } from '../cash-shift/cash-shift.module';

@Module({
  imports: [RestaurantsModule, MenusModule, OrdersModule, CashRegisterModule, CashShiftModule],
  controllers: [KioskController],
  providers: [KioskService],
})
export class KioskModule {}
```

- [ ] **Step 8: Actualizar `orders.module.ts`**

```typescript
// apps/api-core/src/orders/orders.module.ts
import { Module, forwardRef } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderRepository } from './order.repository';
import { EmailModule } from '../email/email.module';
import { PrintModule } from '../print/print.module';
import { EventsModule } from '../events/events.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { CashShiftModule } from '../cash-shift/cash-shift.module';

@Module({
  imports: [EmailModule, forwardRef(() => PrintModule), EventsModule, RestaurantsModule, CashShiftModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
```

- [ ] **Step 9: Eliminar el archivo original del repositorio**

```bash
git rm apps/api-core/src/cash-register/cash-register-session.repository.ts
```

- [ ] **Step 10: Run unit tests to verify no regressions**

```bash
docker compose exec res-api-core pnpm test --no-coverage
```

Expected: Los tests de `orders.service.spec.ts` siguen fallando (el módulo existe ahora pero el servicio aún no inyecta `CashShiftRepository`). Todos los demás tests pasan.

- [ ] **Step 11: Commit**

```bash
git add apps/api-core/src/cash-shift/ \
  apps/api-core/src/cash-register/cash-register.module.ts \
  apps/api-core/src/cash-register/cash-register.service.ts \
  apps/api-core/src/cash-register/cash-register.service.spec.ts \
  apps/api-core/src/kiosk/kiosk.service.ts \
  apps/api-core/src/kiosk/kiosk.module.ts \
  apps/api-core/src/orders/orders.module.ts
git commit -m "refactor(cash-shift): extract CashShiftModule — eliminates circular import risk"
```

---

### Task 3: Implementar cambio en OrdersService.listOrders()

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts`

- [ ] **Step 1: Inyectar CashShiftRepository y actualizar listOrders()**

1. Agregar import al principio de `orders.service.ts`:
```typescript
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { RegisterNotOpenException } from './exceptions/orders.exceptions';
```

2. Agregar `CashShiftRepository` al constructor (como último parámetro, después de `TimezoneService`):
```typescript
constructor(
  private readonly orderRepository: OrderRepository,
  private readonly prisma: PrismaService,
  private readonly orderEventsService: OrderEventsService,
  private readonly emailService: EmailService,
  @Inject(forwardRef(() => PrintService))
  private readonly printService: PrintService,
  private readonly timezoneService: TimezoneService,
  private readonly cashShiftRepository: CashShiftRepository,
) {}
```

3. Reemplazar el método `listOrders()` completo:
```typescript
async listOrders(
  restaurantId: string,
  statuses?: OrderStatus[],
  limit?: number,
  orderNumber?: number,
) {
  const shift = await this.cashShiftRepository.findOpen(restaurantId);
  if (!shift) throw new RegisterNotOpenException();
  return this.orderRepository.listOrders(restaurantId, shift.id, statuses, limit, orderNumber);
}
```

- [ ] **Step 2: Run unit tests to verify they pass**

```bash
docker compose exec res-api-core pnpm test -- orders.service.spec.ts --no-coverage
```

Expected: PASS — todos los casos de `listOrders` pasan.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts
git commit -m "feat(orders): resolve open shift internally in listOrders — no more cashShiftId from client"
```

---

### Task 4: Actualizar OrdersController y su spec

**Files:**
- Modify: `apps/api-core/src/orders/orders.controller.ts`
- Modify: `apps/api-core/src/orders/orders.controller.spec.ts`

- [ ] **Step 1: Escribir tests actualizados del controlador (failing)**

Reemplazar el contenido completo de `orders.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TimezoneService } from '../restaurants/timezone.service';

const mockOrdersService = { listOrders: jest.fn() };
const mockTimezoneService = { getTimezone: jest.fn().mockResolvedValue('UTC') };
const user = { restaurantId: 'r1' };

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();
    controller = module.get<OrdersController>(OrdersController);
    jest.clearAllMocks();
    mockOrdersService.listOrders.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('calls service with restaurantId and default limit', async () => {
      await controller.findAll(user, undefined, undefined, 100);
      expect(mockOrdersService.listOrders).toHaveBeenCalledWith(
        'r1', undefined, 100, undefined,
      );
    });

    it('passes statuses array to service', async () => {
      await controller.findAll(user, [OrderStatus.CREATED, OrderStatus.PROCESSING], undefined, 100);
      expect(mockOrdersService.listOrders).toHaveBeenCalledWith(
        'r1', [OrderStatus.CREATED, OrderStatus.PROCESSING], 100, undefined,
      );
    });

    it('passes orderNumber to service', async () => {
      await controller.findAll(user, undefined, 42, 100);
      expect(mockOrdersService.listOrders).toHaveBeenCalledWith(
        'r1', undefined, 100, 42,
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec res-api-core pnpm test -- orders.controller.spec.ts --no-coverage
```

Expected: FAIL — la firma actual de `findAll` recibe `cashShiftId` como segundo argumento.

- [ ] **Step 3: Actualizar el controlador**

En `orders.controller.ts`, reemplazar el método `findAll()` y sus decoradores con:

```typescript
@Get()
@Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
@ApiOperation({ summary: 'Listar órdenes del turno activo. Visible para ADMIN | MANAGER | BASIC' })
@ApiQuery({ name: 'statuses', required: false, enum: OrderStatus, isArray: true, description: 'Filtrar por estados. Repetir param: statuses=CREATED&statuses=PROCESSING' })
@ApiQuery({ name: 'orderNumber', required: false, type: Number, description: 'Filtrar por número de orden (coincidencia exacta)' })
@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máximo de registros (default 100, max 100)' })
@ApiResponse({ status: 200, description: 'Lista de órdenes', type: [OrderDto] })
@ApiResponse({ status: 400, description: 'Parámetro inválido' })
@ApiResponse({ status: 401, description: 'No autenticado' })
@ApiResponse({ status: 403, description: 'Sin permisos' })
@ApiResponse({ status: 409, description: 'No hay caja abierta', schema: { example: { code: 'REGISTER_NOT_OPEN' } } })
async findAll(
  @CurrentUser() user: { restaurantId: string },
  @Query('statuses', new ParseEnumArrayPipe(OrderStatus)) statuses?: OrderStatus[],
  @Query('orderNumber', new ParseIntPipe({ optional: true })) orderNumber?: number,
  @Query('limit', new DefaultValuePipe(100), ParseIntPipe, new ClampIntPipe(1, 100)) limit = 100,
) {
  const orders = await this.ordersService.listOrders(
    user.restaurantId,
    statuses,
    limit,
    orderNumber,
  );
  const tz = await this.timezoneService.getTimezone(user.restaurantId);
  return orders.map(o => ({
    ...o,
    displayTime: new Intl.DateTimeFormat('es', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(o.createdAt)),
  }));
}
```

También eliminar `ParseUUIDPipe` de la línea de imports de `@nestjs/common` (ya no se usa).

- [ ] **Step 4: Run controller tests to verify they pass**

```bash
docker compose exec res-api-core pnpm test -- orders.controller.spec.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Run full unit test suite**

```bash
docker compose exec res-api-core pnpm test --no-coverage
```

Expected: PASS (todo el suite).

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/orders/orders.controller.ts \
  apps/api-core/src/orders/orders.controller.spec.ts
git commit -m "feat(orders/controller): remove cashShiftId query param from GET /orders"
```

---

### Task 5: Actualizar e2e tests (listOrders.e2e-spec.ts)

**Files:**
- Modify: `apps/api-core/test/orders/listOrders.e2e-spec.ts`

El setup actual abre dos turnos para `restA`. El nuevo comportamiento resuelve el turno desde el JWT, por lo que el setup necesita un único turno abierto por restaurante. Se agrega `restC` sin turno abierto para el caso 409.

- [ ] **Step 1: Reemplazar el contenido completo de `listOrders.e2e-spec.ts`**

```typescript
// test/orders/listOrders.e2e-spec.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrapApp, seedRestaurant, login,
  seedProduct, openCashShift, seedOrder,
} from './orders.helpers';

describe('GET /v1/orders - listOrders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let adminTokenB: string;
  let adminTokenNoShift: string;

  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());

    // restA: un turno abierto con 2 órdenes (CREATED y PROCESSING)
    const restA = await seedRestaurant(prisma, 'A');
    adminToken = await login(app, restA.admin.email);
    managerToken = await login(app, restA.manager.email);
    basicToken = await login(app, restA.basic.email);

    const product = await seedProduct(prisma, restA.restaurant.id, restA.category.id);
    const shift = await openCashShift(prisma, restA.restaurant.id, restA.admin.id);
    shiftId = shift.id;
    await seedOrder(prisma, restA.restaurant.id, shiftId, product.id);
    await seedOrder(prisma, restA.restaurant.id, shiftId, product.id, { status: 'PROCESSING' });

    // restB: un turno abierto con 1 orden → para probar aislamiento
    const restB = await seedRestaurant(prisma, 'B');
    adminTokenB = await login(app, restB.admin.email);
    const productB = await seedProduct(prisma, restB.restaurant.id, restB.category.id);
    const shiftB = await openCashShift(prisma, restB.restaurant.id, restB.admin.id);
    await seedOrder(prisma, restB.restaurant.id, shiftB.id, productB.id);

    // restC: sin turno abierto → para probar 409
    const restC = await seedRestaurant(prisma, 'C');
    adminTokenNoShift = await login(app, restC.admin.email);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer()).get('/v1/orders').expect(401);
  });

  it('Sin caja abierta recibe 409 con code REGISTER_NOT_OPEN', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminTokenNoShift}`)
      .expect(409);
    expect(res.body.code).toBe('REGISTER_NOT_OPEN');
  });

  it('ADMIN puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('MANAGER puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('BASIC puede listar órdenes → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${basicToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('Solo retorna órdenes del propio restaurante (aislamiento)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const resB = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);
    const idsA = resA.body.map((o: any) => o.id);
    const idsB = resB.body.map((o: any) => o.id);
    expect(idsA.some((id: string) => idsB.includes(id))).toBe(false);
  });

  it('?statuses=CREATED retorna solo órdenes CREATED', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?statuses=CREATED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.every((o: any) => o.status === 'CREATED')).toBe(true);
  });

  it('?statuses=CREATED&statuses=PROCESSING retorna solo órdenes con esos estados', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?statuses=CREATED&statuses=PROCESSING')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const allowed = new Set(['CREATED', 'PROCESSING']);
    expect(res.body.every((o: any) => allowed.has(o.status))).toBe(true);
  });

  it('Cada orden incluye items en la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body[0].items)).toBe(true);
  });

  it('Cada orden incluye displayTime en la respuesta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(typeof res.body[0].displayTime).toBe('string');
    expect(res.body[0].displayTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('Retorna órdenes del turno activo (cashShiftId coincide con el turno abierto)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.cashShiftId === shiftId)).toBe(true);
  });

  it('?orderNumber=1 → solo retorna órdenes con orderNumber=1', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?orderNumber=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((o: any) => o.orderNumber === 1)).toBe(true);
  });

  it('?limit=500 retorna máximo 100 órdenes', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/orders?limit=500')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });

  it('?statuses=INVALID_VALUE → 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/orders?statuses=INVALID_VALUE')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
```

- [ ] **Step 2: Run e2e tests to verify they pass**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern="listOrders"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/orders/listOrders.e2e-spec.ts
git commit -m "test(e2e/orders): remove cashShiftId from requests, add 409 REGISTER_NOT_OPEN case"
```

---

### Task 6: Actualizar frontend — api.ts y api.test.ts

**Files:**
- Modify: `apps/ui/src/components/dash/orders/api.ts`
- Modify: `apps/ui/src/components/dash/orders/api.test.ts`

- [ ] **Step 1: Escribir tests actualizados en `api.test.ts`**

Reemplazar el contenido completo:

```typescript
import { getOrders } from './api';
import { apiFetch } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }),
}));

const mockApiFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

describe('getOrders', () => {
  it('serializes statuses as repeated statuses params', async () => {
    await getOrders({ statuses: ['CREATED', 'PROCESSING'] });
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).toContain('statuses=CREATED');
    expect(url).toContain('statuses=PROCESSING');
    expect(url).not.toContain('statuses[]=');
  });

  it('includes limit param when provided', async () => {
    await getOrders({ limit: 100 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=100');
  });

  it('omits statuses from URL when not provided', async () => {
    await getOrders({});
    const url = decodeURIComponent(mockApiFetch.mock.calls[0][0] as string);
    expect(url).not.toContain('statuses');
  });

  it('includes orderNumber in URL when provided', async () => {
    await getOrders({ orderNumber: 42 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('orderNumber=42');
  });

  it('does not include cashShiftId in URL', async () => {
    await getOrders({ orderNumber: 1 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).not.toContain('cashShiftId');
  });
});
```

- [ ] **Step 2: Run UI tests to verify the new test fails**

```bash
docker compose exec res-ui pnpm test -- src/components/dash/orders/api.test.ts
```

Expected: El test "does not include cashShiftId" puede fallar si `api.ts` todavía permite pasar `cashShiftId`.

- [ ] **Step 3: Actualizar la función `getOrders()` en `api.ts`**

Reemplazar la interfaz de parámetros y la implementación de `getOrders()`:

```typescript
export async function getOrders(params: {
  orderNumber?: number;
  statuses?: string[];
  limit?: number;
}): Promise<ApiResult<Order[]>> {
  const query = new URLSearchParams();
  if (params.orderNumber !== undefined) query.set('orderNumber', String(params.orderNumber));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.statuses?.length) {
    for (const s of params.statuses) {
      query.append('statuses', s);
    }
  }
  const res = await apiFetch(`/v1/orders?${query}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
```

- [ ] **Step 4: Run UI tests to verify they pass**

```bash
docker compose exec res-ui pnpm test -- src/components/dash/orders/api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/orders/api.ts \
  apps/ui/src/components/dash/orders/api.test.ts
git commit -m "feat(ui/orders): remove cashShiftId from getOrders() — server resolves active shift"
```

---

### Task 7: Actualizar OrdersPanel — manejar 409 como CLOSED

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`

El método `fetchOrders()` actualmente ignora errores de `getOrders()` y recibe `cashShiftId` como parámetro. Ambos cambian.

- [ ] **Step 1: Reemplazar `fetchOrders()` y actualizar todos sus call sites**

1. Reemplazar la función `fetchOrders()` completa:

```typescript
async function fetchOrders(filter: ActiveFilter | null) {
  const statuses = filter?.statuses.length ? filter.statuses : ['CREATED', 'PROCESSING'];
  const params: Parameters<typeof getOrders>[0] = { limit: 100, statuses };
  if (filter?.orderNumber) params.orderNumber = filter.orderNumber;
  const result = await getOrders(params);
  if (!result.ok) {
    if (result.httpStatus === 409 && result.error?.code === 'REGISTER_NOT_OPEN') {
      setStatus(ORDERS_STATUS.CLOSED);
    }
    return;
  }
  setOrders(result.data);
}
```

2. En `loadSession()`, cambiar:
```typescript
await fetchOrders(result.data.id, null);
```
por:
```typescript
await fetchOrders(null);
```

3. En el useEffect de SSE, cambiar:
```typescript
const reload = () => {
  if (!activeFilter) fetchOrders(session.id, null);
};
```
por:
```typescript
const reload = () => {
  if (!activeFilter) fetchOrders(null);
};
```

4. En `handleAdvance()`, `handlePay()`, `handleCancelConfirm()`, cambiar:
```typescript
await fetchOrders(session!.id, activeFilter);
```
por:
```typescript
await fetchOrders(activeFilter);
```

5. En `handleApplyFilter()`, cambiar:
```typescript
if (session) await fetchOrders(session.id, null);
// ...
if (session) await fetchOrders(session.id, filter);
```
por:
```typescript
await fetchOrders(null);
// ...
await fetchOrders(filter);
```

- [ ] **Step 2: Run full UI test suite**

```bash
docker compose exec res-ui pnpm test
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx
git commit -m "feat(ui/orders): handle 409 REGISTER_NOT_OPEN in fetchOrders — set status to CLOSED"
```

---

### Task 8: Actualizar documentación

**Files:**
- Modify: `apps/api-core/src/orders/orders.module.info.md`
- Create: `apps/api-core/src/cash-shift/cash-shift.module.info.md`

- [ ] **Step 1: Actualizar la sección `#### List — GET /v1/orders` en `orders.module.info.md`**

En la tabla de casos de respuesta del endpoint `GET /v1/orders`, agregar la fila:

```
| Sin caja abierta | 409 | `{ code: "REGISTER_NOT_OPEN" }` |
```

Reemplazar la lista de Query params:

```
Query params:
- `statuses` (opcional, repetible) — filtra por uno o más estados. Ejemplo: `statuses=CREATED&statuses=PROCESSING`
- `orderNumber` (opcional) — filtra por número de orden (coincidencia exacta)
- `limit` (opcional) — máximo de registros a retornar (default `100`, max `100`)
```

En las notas de implementación, reemplazar:

```
- `GET /v1/orders` requiere `cashShiftId` y aplica un `limit` de 100 por defecto (máximo 100). Para reportes históricos completos usar `/history` que tiene paginación
```
por:
```
- `GET /v1/orders` resuelve el turno activo internamente desde el `restaurantId` del JWT. Si no hay caja abierta devuelve 409 `REGISTER_NOT_OPEN`. Aplica `limit` de 100 por defecto (máximo 100). Para reportes históricos completos usar `/history`
```

- [ ] **Step 2: Crear `cash-shift.module.info.md`**

```markdown
### CashShift (cash-shift)

Módulo de infraestructura para acceso a datos de turnos de caja (`CashShift`).

**Propósito:** Proveedor de `CashShiftRepository` — sin lógica de negocio. Extraído de `CashRegisterModule` para evitar dependencia circular con `OrdersModule`.

**Exporta:** `CashShiftRepository`

**Consumidores:**
- `CashRegisterModule` — abre, cierra y consulta turnos
- `OrdersModule` — resuelve el turno activo al listar órdenes (`listOrders`)
- `KioskModule` — verifica si hay caja abierta antes de crear una orden

**No importa ningún otro módulo** (solo `PrismaService` vía el módulo global de Prisma).
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/orders/orders.module.info.md \
  apps/api-core/src/cash-shift/cash-shift.module.info.md
git commit -m "docs(orders/cash-shift): update module info — cashShiftId removed, CashShiftModule documented"
```

---

## Self-Review

### Spec coverage

| Requisito | Task |
|---|---|
| GET /orders sin cashShiftId | Task 3, 4 |
| Servidor resuelve turno activo desde JWT | Task 3 |
| 409 REGISTER_NOT_OPEN si no hay caja abierta | Task 3 |
| Extraer `CashShiftRepository` a `CashShiftModule` | Task 2 |
| Sin dependencia circular | Task 2 |
| `CashRegisterModule` deja de exportar `CashShiftRepository` | Task 2 |
| `KioskModule` importa `CashShiftModule` directamente | Task 2 |
| `OrdersService.listOrders()` sin `cashShiftId` | Task 3 |
| Unit: mock `CashShiftRepository.findOpen()` | Task 1 |
| Unit: caso `findOpen` null → `RegisterNotOpenException` | Task 1 |
| Unit: caso `findOpen` retorna shift → pasa `shift.id` al repo | Task 1 |
| Actualizar controller (quitar `@Query('cashShiftId')`) | Task 4 |
| E2E: quitar `cashShiftId` de requests | Task 5 |
| E2E: agregar caso 409 `REGISTER_NOT_OPEN` | Task 5 |
| Frontend: quitar `cashShiftId` de `getOrders()` | Task 6 |
| Frontend: 409 → `CLOSED` en `OrdersPanel` | Task 7 |
| Docs: `cash-shift.module.info.md` | Task 8 |
| Docs: `orders.module.info.md` actualizado | Task 8 |

### Placeholder scan

Ningún paso usa "TBD", "TODO", "similar to Task N", "add appropriate handling", ni describe código sin mostrarlo.

### Type consistency

- `CashShiftRepository` importado desde `../cash-shift/cash-shift.repository` — consistente en Tasks 1, 2, 3
- `listOrders(restaurantId, statuses?, limit?, orderNumber?)` — firma consistente en Tasks 1, 3, 4
- `fetchOrders(filter: ActiveFilter | null)` — firma consistente en Task 7 en todos los call sites
- `getOrders({ orderNumber?, statuses?, limit? })` — consistente en Tasks 6 y 7
