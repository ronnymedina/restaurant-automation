# Hardening batch 2 — Orders, Cash Register, Kitchen (H-07, H-08, H-11, H-12, H-15)

**Fecha:** 2026-05-28
**Estado:** Diseño aprobado
**Audit asociado:** `2026-05-24-orders-cash-kitchen-audit-findings.md`
**Tipo:** Design (no implementación)

---

## Contexto

Segundo batch de remediaciones del audit doc. La primera tanda (H-01..H-03, H-05, H-06, H-09, H-13, H-14, H-AUX-01) cerró los críticos y race conditions. Este batch cubre la lista **"Próximo sprint"** del audit:

- **H-07** — `FindHistoryDto` con validación de inputs + tope de rango de fechas (🟠 ALTO · seguridad/error)
- **H-08** — `OrderShiftReportRepository` filtrar por `restaurantId` (🟠 ALTO · defensa en profundidad)
- **H-11** — Eliminar `CashShiftRepository.close()` (🟠 ALTO · dinero / bomba latente)
- **H-12** — `CashRegisterStatsService.getSummary` filtrar por `restaurantId` + 404 cross-tenant (🟠 ALTO · defensa en profundidad)
- **H-15** — Eliminar feature `notifyOffline` (🟠 ALTO · feature dead-end)

Forma de entrega: **un único commit** "batch hardening próximo sprint". Coherente con la práctica del repo (la tanda anterior fueron 2 commits cohesivos por riesgo, no 5 sueltos).

---

## Diagnóstico revisado durante la exploración

### H-15 — el audit estaba parcialmente equivocado

El audit afirmaba que `restaurant$` "es escuchado por kiosk, cocina y todos los clientes del restaurante". La inspección del código contradice eso:

- `restaurant$` lo consume **solo** `/v1/events/dashboard` (un único endpoint SSE).
- `kitchen$` lo consume **solo** `/v1/events/kitchen`.
- El kiosk **no consume SSE**: no hay `EventSource` en `apps/ui/src/components/kiosk/` ni en `pages/kiosk/`.

El verdadero problema de H-15 no es el canal — es que **nadie escucha `kitchen:offline` en el frontend**. El `OrdersPanel.tsx` solo registra listeners para `ORDER_EVENTS.NEW` y `ORDER_EVENTS.UPDATED` (líneas 93-94). El emit existe, el endpoint existe, pero el evento muere sin consumidor.

**Decisión:** eliminar todo el feature en vez de cablear un listener UI nuevo. Razones:
1. El feature como detector de offline es frágil — solo dispara si la cocina cierra activamente (`beforeunload` no garantiza envío). Una cocina que se queda sin red no notifica.
2. Una detección real de offline necesita heartbeat SSE o `last-seen` en BD, no un endpoint best-effort.
3. YAGNI: si después se necesita, la implementación correcta es otra.

### Money: ya está en pesos (no centavos) en la respuesta de `findHistory`

Confirmado leyendo `OrderRepository.findHistory:209-210`: el resultado pasa por `serializeOrder` que aplica `fromCents` a todos los campos de dinero. Esto fue el fix de H-22 (2026-05-25). H-07 toca **solo input validation**; la salida está bien.

---

## H-07 — `FindHistoryDto`

### Archivos

- Nuevo: `apps/api-core/src/orders/dto/find-history.dto.ts`
- Nuevo: `apps/api-core/src/orders/dto/validators/valid-date-range.validator.ts`
- Edit: `apps/api-core/src/orders/orders.controller.ts:77-103`
- Edit: `apps/api-core/src/orders/orders.service.ts:122-142` (signatura del `filters` deja de aceptar strings)
- Tests:
  - Nuevo: `apps/api-core/src/orders/dto/find-history.dto.spec.ts`
  - Nuevo: `apps/api-core/test/orders/findHistory.e2e-spec.ts` (o adjuntar al existente si lo hay)

### DTO

```ts
export class FindHistoryDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  orderNumber?: number;

  @IsOptional() @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom debe ser YYYY-MM-DD' })
  dateFrom?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo debe ser YYYY-MM-DD' })
  dateTo?: string;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number)
  limit?: number;
}
```

### Validador cross-field

`@ValidatorConstraint({ name: 'ValidDateRange', async: false })` aplicado a nivel clase con `@Validate(ValidDateRangeConstraint)`:

- Si `dateFrom` y `dateTo` están: parsear como `Date`, validar `dateFrom <= dateTo`.
- Si ambos están: validar `(dateTo - dateFrom) <= 90 días`.
- Si solo uno está: pasa sin tope (el otro es "abierto").

Mensajes de error explícitos:
- `"dateFrom debe ser menor o igual a dateTo"`
- `"el rango de fechas no puede exceder 90 días"`

### Controller refactor

Antes (líneas 86-103):
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

Después:
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

### Comportamiento esperado

| Input | Antes | Después |
|---|---|---|
| `?limit=abc` | 500 opaco (Prisma) | 400 `{message: 'limit must be a number...'}` |
| `?limit=999` | Recortado a 100 (silencioso) | 400 `{message: 'limit must not be greater than 100'}` |
| `?dateFrom=hoy` | 500 (`toUtcBoundary` falla) | 400 `{message: 'dateFrom debe ser YYYY-MM-DD'}` |
| `?dateFrom=2025-01-01&dateTo=2024-01-01` | Query con rango vacío (silencioso) | 400 `{message: 'dateFrom debe ser menor o igual a dateTo'}` |
| `?dateFrom=2024-01-01&dateTo=2026-12-31` | `count + findMany` masivo | 400 `{message: 'rango máximo: 90 días'}` |
| `?orderNumber=abc` | Filtro silencioso ignorado | 400 |
| `?status=BLAH` | Query con status inválido (Prisma error) | 400 |

---

## H-08 — `OrderShiftReportRepository` filtrar por `restaurantId`

### Archivos

- Edit: `apps/api-core/src/orders/order-shift-report.repository.ts:34-50`
- Tests: `apps/api-core/src/orders/order-shift-report.repository.spec.ts` (existente o nuevo)

### Cambios

```ts
groupOrdersByShift(restaurantId: string, sessionId: string): Promise<OrderGroupRow[]> {
  return this.prisma.order.groupBy({
    by: [status, paymentMethod, orderType, orderSource],
    where: { cashShiftId: sessionId, cashShift: { restaurantId } },
    _sum: { totalAmount: true },
    _count: { id: true },
  }) as unknown as Promise<OrderGroupRow[]>;
}

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

Nota: la query a `product.findMany` también recibe el filtro `restaurantId` para evitar leak teórico si dos restaurantes tuvieran un productId compartido (no debería ocurrir pero defensa en profundidad).

### Resultado cross-tenant

`groupOrdersByShift(restA, sessionB)` → array vacío. `getTopProductsWithNamesByShift(restA, sessionB)` → array vacío. Eso es OK porque el endpoint del controller que los consume hace primero la validación de tenant (ver H-12).

---

## H-11 — Eliminar `CashShiftRepository.close()`

### Archivos

- Edit: `apps/api-core/src/cash-shift/cash-shift.repository.ts:47-61` (borrar método)
- Tests: revisar `cash-shift.repository.spec.ts` y borrar los del método si existen

### Justificación

`grep -rn "cashShiftRepository.close\|registerSessionRepository.close" src/` → 0 callers. El cierre real ocurre vía `tx.cashShift.update` dentro de `CashRegisterService.closeSession` (con lock pesimista vía `lockOpenShift`, agregado en H-09). El método con firma `totalSales: number` es bomba latente: el día que alguien lo llame, hace `Number(BigInt)` con pérdida de precisión.

---

## H-12 — `getSummary` con `restaurantId` + 404 cross-tenant

### Archivos

- Edit: `apps/api-core/src/cash-register/cash-register-stats.service.ts:47-50`
- Edit: `apps/api-core/src/cash-register/cash-register.service.ts:78, 119-125`
- Edit: `apps/api-core/src/cash-register/cash-register.controller.ts:119-122, 150-159, 169-175`
- Tests: `cash-register-stats.service.spec.ts`, `cash-register.service.spec.ts`, e2e existente

### `CashRegisterStatsService.getSummary`

```ts
async getSummary(restaurantId: string, sessionId: string): Promise<ShiftSummary> {
  const [groups, topProducts] = await Promise.all([
    this.orderShiftReport.groupOrdersByShift(restaurantId, sessionId),
    this.orderShiftReport.getTopProductsWithNamesByShift(restaurantId, sessionId),
  ]);
  // resto igual
}
```

### `CashRegisterService.getSessionSummary` (validación explícita)

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

Razón de la validación explícita en service: defensa en profundidad. Hoy salvada por `CashShiftGuard` en el controller. Si alguien añade un endpoint futuro que llame `getSessionSummary` sin el guard, esta capa interna sigue protegiendo.

### `CashRegisterService.closeSession`

Único cambio interno: la llamada en línea 78 pasa a `this.statsService.getSummary(restaurantId, closedSession.id)`.

### Callers del controller

| Endpoint | Línea actual | Cambio |
|---|---|---|
| `GET /stats` | `cash-register.controller.ts:120` | `this.statsService.getSummary(user.restaurantId, sessionId)` |
| `GET /summary/:sessionId` | `cash-register.controller.ts:152` | `this.registerService.getSessionSummary(user.restaurantId, req.cashShift.id)` |
| `GET /top-products/:sessionId` | `cash-register.controller.ts:172` | `this.statsService.getSummary(user.restaurantId, req.cashShift.id)` |
| `POST /close` | `cash-register.controller.ts:80` | sin cambio externo (`closeSession` ya recibe `restaurantId`) |

### Resultado cross-tenant

`GET /v1/cash-register/summary/{sessionId_otro_tenant}` → `404 CASH_REGISTER_NOT_FOUND` en vez de filtrar datos. El guard `CashShiftGuard` ya devolvía 404 en ese caso; ahora la validación está duplicada en el service para defensa en profundidad. Comportamiento externo idéntico para clientes legítimos.

---

## H-15 — Eliminar feature `notifyOffline`

### Archivos

- Edit: `apps/api-core/src/kitchen/kitchen.controller.ts:106-117` (borrar endpoint)
- Edit: `apps/api-core/src/kitchen/kitchen.service.ts:82-84` (borrar método)
- Edit: `apps/api-core/src/kitchen/kitchen.module.info.md:65, 124-131` (borrar referencias)
- Edit: `apps/api-core/src/kitchen/kitchen.service.spec.ts:181` (borrar test)
- Verificación: `grep -rn "notify-offline\|notifyOffline" apps/ui`; si hay caller en `kitchen/index.astro`, borrar también.

### Verificación previa al implementar

Como parte del plan, primero correr:
```bash
grep -rn "notify-offline\|notifyOffline" apps/ui apps/api-core/src
```

Posibles ubicaciones a inspeccionar:
- `apps/ui/src/pages/kitchen/index.astro` — handler de `beforeunload`
- Cualquier `kitchen-api.ts` que envuelva la llamada

### Razón

Feature dead-end:
1. Emit existente va a `restaurant$`, que solo lo consume el dashboard.
2. Dashboard NO registra listener para `kitchen:offline` (solo `order:new` / `order:updated`).
3. El evento se publica y muere sin consumidor.

Detección real de offline requiere mecanismo diferente (heartbeat, last-seen). YAGNI.

---

## Documentación a actualizar

Como parte del commit:

1. **`apps/api-core/src/orders/orders.module.info.md`** — contrato de `GET /history`:
   - Listar los rechazos del DTO (límite 100, rango ≤ 90 días, fechas `YYYY-MM-DD`, status como enum).
   - Mencionar que los montos en la respuesta van en pesos (referencia a `serializeOrder` / H-22).

2. **`apps/api-core/src/cash-register/cash-register.module.info.md`** — firma de servicios:
   - `getSessionSummary(restaurantId, sessionId)` — documentar que valida pertenencia y devuelve 404 cross-tenant.
   - `getSummary(restaurantId, sessionId)` — documentar el filtro de tenant.

3. **`apps/api-core/src/kitchen/kitchen.module.info.md`**:
   - Borrar fila de `POST /v1/kitchen/:slug/notify-offline` de la tabla de endpoints (línea 65).
   - Borrar sección "Notify Offline" (líneas 124-131).

4. **`apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`**:
   - Actualizar tabla resumen ejecutivo: `H-07 ✅, H-08 ✅, H-11 ✅, H-12 ✅, H-15 ✅`.
   - Por hallazgo, agregar al final del bloque:
     - `**Estado:** ✅ Implementado (2026-05-28)`
     - `**Plan asociado:** 2026-05-28-orders-cashshift-kitchen-hardening-batch2-design.md`
     - Para H-15: nota explicando que el diagnóstico se ajustó (canal no era el problema, era que el evento no tenía listener).
   - Actualizar "Orden sugerido de remediación":
     - Marcar tachadas las filas de "Próximo sprint".

---

## Estrategia de tests (TDD)

Cada cambio TDD-first: test rojo → implementación → verde.

### Unitarios (`pnpm test`)

| Test file | Casos clave |
|---|---|
| `find-history.dto.spec.ts` (nuevo) | (a) `limit=abc` → fail, (b) `dateFrom=2025-13-01` → fail, (c) rango > 90d → fail, (d) `dateFrom > dateTo` → fail, (e) caso válido pasa, (f) defaults aplicados |
| `order-shift-report.repository.spec.ts` | (a) `groupOrdersByShift(restA, sessionA)` → datos, (b) `groupOrdersByShift(restA, sessionB)` → vacío |
| `cash-register-stats.service.spec.ts` | (a) `getSummary(restA, sessionA)` → counts reales, (b) `getSummary(restA, sessionB)` → counts en 0 |
| `cash-register.service.spec.ts` | `getSessionSummary(restA, sessionB)` → `CashRegisterNotFoundException` |

### E2e (`pnpm test:e2e`)

| Test file | Casos clave |
|---|---|
| `orders/findHistory.e2e-spec.ts` | Validar 400 en cada uno de los rechazos del DTO + caso válido sigue funcionando |
| `cash-register/summary.e2e-spec.ts` | Usuario rest A pide `/summary/{sessionId_B}` → 404 con código `CASH_REGISTER_NOT_FOUND` |

### Tests a eliminar

- `kitchen.service.spec.ts:181` — "emits kitchen:offline to restaurant room"
- Cualquier e2e de `POST /v1/kitchen/:slug/notify-offline` si existe
- Tests de `CashShiftRepository.close()` si existen

### Comandos de verificación final (dentro del contenedor)

```bash
docker compose exec res-api-core pnpm test
docker compose exec res-api-core pnpm test:e2e
```

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Frontend del dashboard depende de un campo de respuesta de `/orders/history` que cambie | Ninguno: el DTO solo cambia el input. El payload de salida no se toca. |
| Frontend del kitchen sigue llamando `POST /notify-offline` después del delete | El `grep -rn` previo al commit lo detecta. Si quedara colgado, el cliente recibe 404 — no rompe nada operativo porque el feature ya era no-bloqueante. |
| Tests e2e existentes asumían `getSummary(sessionId)` con un solo argumento | Buscar todos los callers en specs y actualizarlos como parte del commit. |
| Algún caller interno usa `findHistory` con `dateFrom` formato no-`YYYY-MM-DD` | Hoy el único caller es `findHistory` endpoint. Service signature pasa a aceptar solo `YYYY-MM-DD`. |

---

## Verificación post-commit

1. Smoke test manual de `/dash/orders-history` con filtros:
   - Filtro de fechas válido → resultados correctos.
   - Filtro inválido (limit=999) → toast/error visible (no 500).
2. Smoke test de `/dash/register-history` abriendo el modal de detalle de un turno cerrado → summary sigue cargando.
3. `git grep -n "notify-offline"` → 0 resultados.
4. Audit doc actualizado con los 5 ✅.

---

## Entregables

- 1 commit con prefijo `fix(api): hardening batch 2 audit (H-07, H-08, H-11, H-12, H-15)`.
- Diff esperado: ~400-500 líneas con tests.
- Audit doc actualizado.
- 3 `info.md` actualizados.
