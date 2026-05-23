# Cash Register Stats — Design Spec

**Fecha:** 2026-05-21
**Módulo:** `cash-register`
**Estado:** Aprobado

---

## Contexto

El módulo `cash-register` ya tiene dos endpoints para estadísticas de sesión:
- `GET /summary/:sessionId` — completed/cancelled counts, payment breakdown
- `GET /top-products/:sessionId` — top 5 productos

Ambos son parciales y no cubren el caso de uso principal: ver métricas en vivo de la sesión activa. Además, el resumen de cierre de caja (`POST /close`) recalcula sus propias métricas de forma independiente. Este spec consolida toda esa lógica en un `CashRegisterStatsService` reutilizable.

---

## Objetivo

Crear `CashRegisterStatsService` dentro del módulo `cash-register` con un método `getStats(sessionId, restaurantId)` que:
- Devuelve todas las métricas relevantes de una sesión en **2 queries en paralelo**
- Es reutilizable por el controller de sesión activa, el cierre de caja, y cualquier endpoint de sesión histórica
- Reemplaza `getSessionSummary` y `getTopProducts` en `CashRegisterService`

---

## Decisión de arquitectura

**No se crea un módulo nuevo.** `CashRegisterStatsService` vive dentro del módulo `cash-register` existente porque:
- Toda la lógica está acoplada a `CashShift` y sus `Order`s
- Evita dependencias circulares entre módulos
- Si en el futuro se necesitan stats cross-sesión o cross-restaurante, se extrae a un módulo `reports` dedicado

---

## Estructura de archivos

```
apps/api-core/src/cash-register/
├── cash-register.controller.ts          (agregar GET /stats; migrar /summary y /top-products)
├── cash-register.service.ts             (eliminar getSessionSummary y getTopProducts)
├── cash-register.module.ts              (registrar CashRegisterStatsService)
├── cash-register-stats.service.ts       ← nuevo
├── cash-register-stats.service.spec.ts  ← nuevo
├── dto/
│   ├── cash-register-response.dto.ts    (agregar @ApiProperty Swagger types para stats)
│   └── (sin archivo de tipos internos — el tipo ShiftStats vive en el service)
└── serializers/
    └── cash-register-stats.serializer.ts   ← nuevo (clase con @Exclude/@Expose + @Type)
```

---

## Interfaz del servicio

```ts
// cash-register-stats.service.ts
async getStats(sessionId: string, restaurantId: string): Promise<ShiftStats>
```

El `restaurantId` se usa para validar que la sesión pertenece al restaurante del usuario. Si la sesión no existe o no pertenece al restaurante, lanza `CashRegisterNotFoundException`.

---

## Response shape — `ShiftStatsDto`

```json
{
  "counts": {
    "total": 12,
    "created": 1,
    "confirmed": 2,
    "processing": 1,
    "served": 1,
    "completed": 6,
    "cancelled": 1,
    "pending": 5
  },
  "revenue": {
    "completed": 120.50,
    "pending": 45.00,
    "averageTicket": 20.08
  },
  "byPaymentMethod": [
    { "method": "CASH", "count": 3, "total": 60.00 },
    { "method": "CARD", "count": 3, "total": 60.50 }
  ],
  "byOrderType": [
    { "type": "PICKUP", "count": 8 },
    { "type": "DELIVERY", "count": 4 }
  ],
  "byOrderSource": [
    { "source": "STAFF", "count": 7 },
    { "source": "KIOSK", "count": 5 }
  ],
  "topProducts": [
    { "id": "uuid", "name": "Burger Clásica", "quantity": 15, "total": 75.00 }
  ]
}
```

**Reglas de cálculo:**
- `counts.pending` = total − completed − cancelled
- `revenue.completed` = sum(totalAmount) where status = COMPLETED
- `revenue.pending` = sum(totalAmount) where status NOT IN [COMPLETED, CANCELLED]
- `revenue.averageTicket` = completed.revenue / counts.completed (0 si counts.completed = 0)
- `byPaymentMethod` = solo órdenes COMPLETED (dinero real en caja)
- `byOrderType` = todas las órdenes (incluye canceladas — refleja intención original)
- `byOrderSource` = todas las órdenes
- `topProducts` = top 5 por quantity, excluyendo items de órdenes CANCELLED; máximo 5 elementos

---

## Serialización — `CashShiftStatsSerializer`

El response usa el patrón `class-transformer` establecido en el módulo: clase con `@Exclude()` a nivel de clase y `@Expose()` por cada propiedad expuesta. El controller ya tiene `@UseInterceptors(ClassSerializerInterceptor)` aplicado a nivel de controlador, lo que procesa el árbol completo de objetos.

### Estructura de clases

```ts
// serializers/cash-register-stats.serializer.ts

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
  constructor(partial: Partial<StatsCountsSerializer>) { Object.assign(this, partial); }
}

@Exclude()
export class StatsRevenueSerializer {
  @Expose() @ApiProperty() completed: number;
  @Expose() @ApiProperty() pending: number;
  @Expose() @ApiProperty() averageTicket: number;
  constructor(partial: Partial<StatsRevenueSerializer>) { Object.assign(this, partial); }
}

@Exclude()
export class StatsByPaymentMethodSerializer {
  @Expose() @ApiProperty() method: string;
  @Expose() @ApiProperty() count: number;
  @Expose() @ApiProperty() total: number;
  constructor(partial: Partial<StatsByPaymentMethodSerializer>) { Object.assign(this, partial); }
}

@Exclude()
export class StatsByOrderTypeSerializer {
  @Expose() @ApiProperty() type: string;
  @Expose() @ApiProperty() count: number;
  constructor(partial: Partial<StatsByOrderTypeSerializer>) { Object.assign(this, partial); }
}

@Exclude()
export class StatsByOrderSourceSerializer {
  @Expose() @ApiProperty() source: string;
  @Expose() @ApiProperty() count: number;
  constructor(partial: Partial<StatsByOrderSourceSerializer>) { Object.assign(this, partial); }
}

@Exclude()
export class StatsTopProductSerializer {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() name: string;
  @Expose() @ApiProperty() quantity: number;
  @Expose() @ApiProperty() total: number;
  constructor(partial: Partial<StatsTopProductSerializer>) { Object.assign(this, partial); }
}

@Exclude()
export class CashShiftStatsSerializer {
  @Expose() @ApiProperty({ type: StatsCountsSerializer })
  @Type(() => StatsCountsSerializer)
  counts: StatsCountsSerializer;

  @Expose() @ApiProperty({ type: StatsRevenueSerializer })
  @Type(() => StatsRevenueSerializer)
  revenue: StatsRevenueSerializer;

  @Expose() @ApiProperty({ type: [StatsByPaymentMethodSerializer] })
  @Type(() => StatsByPaymentMethodSerializer)
  byPaymentMethod: StatsByPaymentMethodSerializer[];

  @Expose() @ApiProperty({ type: [StatsByOrderTypeSerializer] })
  @Type(() => StatsByOrderTypeSerializer)
  byOrderType: StatsByOrderTypeSerializer[];

  @Expose() @ApiProperty({ type: [StatsByOrderSourceSerializer] })
  @Type(() => StatsByOrderSourceSerializer)
  byOrderSource: StatsByOrderSourceSerializer[];

  @Expose() @ApiProperty({ type: [StatsTopProductSerializer] })
  @Type(() => StatsTopProductSerializer)
  topProducts: StatsTopProductSerializer[];

  constructor(stats: ShiftStats) {
    // Convierte BigInt → number via fromCents() en el constructor
    this.counts = new StatsCountsSerializer(stats.counts);
    this.revenue = new StatsRevenueSerializer({
      completed: fromCents(stats.revenue.completed),
      pending: fromCents(stats.revenue.pending),
      averageTicket: fromCents(stats.revenue.averageTicket),
    });
    this.byPaymentMethod = stats.byPaymentMethod.map(
      (x) => new StatsByPaymentMethodSerializer({ ...x, total: fromCents(x.total) }),
    );
    this.byOrderType = stats.byOrderType.map((x) => new StatsByOrderTypeSerializer(x));
    this.byOrderSource = stats.byOrderSource.map((x) => new StatsByOrderSourceSerializer(x));
    this.topProducts = stats.topProducts.map(
      (x) => new StatsTopProductSerializer({ ...x, total: fromCents(x.total) }),
    );
  }
}
```

### Reglas del patrón
- `@Exclude()` en la clase: bloquea todo por defecto; solo llega al cliente lo que tenga `@Expose()`
- `@Type(() => NestedClass)` en arrays/objetos anidados: necesario para que `ClassSerializerInterceptor` traverse la jerarquía correctamente
- Toda conversión `BigInt → number` ocurre en el constructor del serializer, no en el servicio — el servicio devuelve `bigint` internamente
- El controller instancia directamente: `return new CashShiftStatsSerializer(stats)`
- `session-summary.serializer.ts` (funciones planas) se elimina; sus casos de uso se delegan al nuevo serializer

---

## Implementación interna — queries

Se ejecutan **2 queries en paralelo** con `Promise.all`:

**Query 1 — Agregación multidimensional de órdenes:**
```ts
prisma.order.groupBy({
  by: ['status', 'paymentMethod', 'orderType', 'orderSource'],
  where: { cashShiftId: sessionId },
  _sum: { totalAmount: true },
  _count: { id: true },
})
```
Un solo `groupBy` con 4 dimensiones. Se itera una vez en memoria para construir todos los agregados: counts por status, revenue breakdowns, byPaymentMethod, byOrderType, byOrderSource.

**Query 2 — Top products:**
```ts
prisma.orderItem.groupBy({
  by: ['productId'],
  where: { order: { cashShiftId: sessionId, status: { not: OrderStatus.CANCELLED } } },
  _sum: { quantity: true, subtotal: true },
  orderBy: { _sum: { quantity: 'desc' } },
  take: 5,
})
```
Seguido de un `findMany` por los 5 productIds para obtener nombres.

---

## Endpoint

```
GET /v1/cash-register/stats
```

| Campo | Valor |
|---|---|
| Auth | `JwtAuthGuard` + `RolesGuard` |
| Roles | BASIC, MANAGER, ADMIN |
| `restaurantId` | Del JWT (`@CurrentUser()`) |
| Comportamiento sin sesión abierta | Retorna estructura con todos los valores en 0 (no lanza error) |

El controller llama `findOpen(restaurantId)`. Si no hay sesión, devuelve la estructura vacía. Esto es más útil que un 404 en una pantalla de dashboard siempre visible.

---

## Índice de base de datos requerido

`OrderItem.orderId` no tiene índice en PostgreSQL (los FK no crean índice automáticamente). El query de top products hace un JOIN `OrderItem → Order` por `orderId` que resulta en seq scan sin este índice.

**Migración requerida:**
```prisma
// En OrderItem
@@index([orderId])
```

Genera:
```sql
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
```

Los demás queries filtran por `cashShiftId` en `Order`, que ya tiene `@@index([cashShiftId])`.

---

## Reutilización en cierre de caja

`closeSession` en `CashRegisterService` actualmente recalcula sus propias métricas. Se migra para usar `getStats` después del UPDATE de cierre:

```ts
// Dentro de la transacción de cierre
const closed = await tx.cashShift.update({ ... });
// Fuera de la transacción (lectura, no escribe)
const stats = await this.statsService.getStats(session.id, restaurantId);
return { session: closed, stats };
```

El response de `POST /close` expone `stats` completo en lugar del `summary` actual.

---

## Migración de endpoints existentes

| Endpoint | Acción |
|---|---|
| `GET /summary/:sessionId` | Refactorizar para llamar `statsService.getStats()` y devolver subset compatible con `SessionSummaryResponseDto` actual (retrocompatibilidad) |
| `GET /top-products/:sessionId` | Refactorizar para llamar `statsService.getStats()` y devolver solo `topProducts` |
| `getSessionSummary` en `CashRegisterService` | Eliminar |
| `getTopProducts` en `CashRegisterService` | Eliminar |

---

## Testing

### Unit tests — `cash-register-stats.service.spec.ts`

| Caso | Descripción |
|---|---|
| Sesión vacía | Todos los counts en 0, revenue en 0, arrays vacíos |
| Mix de statuses | Counts correctos para cada status |
| `counts.pending` | Excluye COMPLETED y CANCELLED correctamente |
| `revenue.pending` | Excluye COMPLETED y CANCELLED de la suma |
| `averageTicket` con 0 completados | Retorna 0 sin dividir por cero |
| `byPaymentMethod` | Solo incluye órdenes COMPLETED |
| `byOrderType` | Incluye todos los statuses (incluso CANCELLED) |
| `topProducts` empate | Ordena por quantity desc, devuelve máx 5 |
| `topProducts` excluye CANCELLED | Items de órdenes canceladas no cuentan |
| Sesión de otro restaurante | Lanza `CashRegisterNotFoundException` |
| Sesión inexistente | Lanza `CashRegisterNotFoundException` |

### E2E tests — `test/cash-register/cashRegisterStats.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC puede ver stats | 200 | Roles abiertos |
| MANAGER puede ver stats | 200 | |
| ADMIN puede ver stats | 200 | |
| Sin caja abierta | 200 | Estructura con zeros, no error |
| Con sesión activa y órdenes mixtas | 200 | Counts correctos por status |
| `revenue.completed` correcto | 200 | Suma solo COMPLETED |
| `revenue.pending` correcto | 200 | Excluye COMPLETED y CANCELLED |
| `averageTicket` correcto | 200 | completed.revenue / counts.completed |
| `byPaymentMethod` solo COMPLETED | 200 | Método de pago no impacta CANCELLED |
| Top 5 productos | 200 | Ordenados por quantity desc |
| CANCELLED excluidos de topProducts | 200 | Items de órdenes canceladas no aparecen |
| Stats de otro restaurante | 401/403 | JWT limita al restaurante propio |
| Stats son consistentes con cierre | 200 | Stats activos == stats del close |
