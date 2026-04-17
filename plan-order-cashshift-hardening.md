# Plan: Hardening de modelos Order/OrderItem/CashShift para modo web (PostgreSQL)

## Context

El sistema fue diseñado originalmente para uso local (SQLite, un solo usuario). Al migrarlo a web con PostgreSQL, múltiples usuarios pueden operar simultáneamente sobre el mismo restaurante, exponiendo race conditions y problemas de concurrencia que SQLite ocultaba por su modelo de escritura single-writer.

Este plan corrige los problemas críticos de concurrencia, mejora el modelo de CashShift, y optimiza queries pesadas.

---

## Análisis de problemas encontrados

### Críticos (concurrencia en PostgreSQL)

**1. Race condition en `openSession`** — `cash-register.service.ts:21-28`
- Patrón check-then-act: `findOpen()` → validar → `create()` NO es atómico.
- Dos requests concurrentes pueden ver ambas que no hay sesión abierta y crear dos CashShift simultáneos.
- SQLite lo evitaba por ser single-writer. PostgreSQL no.
- **Fix:** Unique partial index en PostgreSQL: `CREATE UNIQUE INDEX ON "CashShift"("restaurantId") WHERE status = 'OPEN'`. Capturar la violación de constraint como `CashRegisterAlreadyOpenException`.

**2. Race condition en validación de stock** — `orders.service.ts:200-248`
- Flujo actual: `findUnique(product)` → `validateStock()` → `decrement(stock)` — son 3 operaciones separadas.
- Bajo PostgreSQL READ COMMITTED (default), otro transaction puede decrementar el stock entre el `findUnique` y el `decrement`, dejando el stock en negativo.
- **Fix:** Cambiar `decrementAllStock` a un UPDATE condicional: `UPDATE products SET stock = stock - qty WHERE id = ? AND stock >= qty` y verificar que se afectó 1 fila. Si no, lanzar `StockInsufficientException`. Esto elimina la validación previa separada.

**3. `closeSession` no es atómico** — `cash-register.service.ts:30-67`
- Flujo actual: `findOpen()` → `findBySessionId()` (carga órdenes) → calcula totales → `close()`.
- Nuevas órdenes pueden crearse entre el fetch y el close, haciendo que `totalSales` y `totalOrders` queden desactualizados.
- **Fix:** Usar `$transaction` que cierra el shift primero (cambia status a CLOSED, bloqueando nuevas órdenes), luego agrega el cálculo de totales con un aggregate query.

### Importantes (correctitud y robustez)

**4. Falta constraint único `(cashShiftId, orderNumber)`**
- No hay protección a nivel DB contra números de orden duplicados dentro de un turno.
- El increment de `lastOrderNumber` dentro de transaction es seguro en PostgreSQL (row lock en UPDATE), pero el constraint es una red de seguridad.
- **Fix:** Agregar `@@unique([cashShiftId, orderNumber])` al modelo `Order` en ambos schemas.

**5. `getSessionSummary` carga todas las órdenes en memoria** — `cash-register.service.ts:106-145`
- `findBySessionId` retorna todas las órdenes con sus items para calcular top productos en memoria.
- En un turno con 300+ órdenes esto es costoso y no escala.
- **Fix:** Usar `groupBy` de Prisma o `$queryRaw` para agregar por producto directo en DB.

### Modelo (mejoras de diseño)

**6. CashShift: soporte multi-cajero (`userId`)**
- Hoy el constraint es uno OPEN por restaurante. Para soportar múltiples cajeros (cada uno con su zona/mesa), el CashShift debe asociarse a un usuario.
- La unicidad pasa de `(restaurantId) WHERE status='OPEN'` a `(restaurantId, userId) WHERE status='OPEN'`.
- Esto permite que Usuario A abra su caja (zona mesas) y Usuario B abra la suya (barra) simultáneamente en el mismo restaurante.
- `userId` es **requerido** — toda apertura de caja debe asociarse a un usuario. Como estamos en desarrollo sin datos reales, `prisma db push` aplica el cambio sin migración.
- El partial index en PostgreSQL cambia:
  ```sql
  CREATE UNIQUE INDEX "one_open_shift_per_user_per_restaurant"
  ON "CashShift"("restaurantId", "userId") WHERE status = 'OPEN';
  ```
- El `findOpen(restaurantId)` del kiosk debe recibir también `userId` para encontrar la caja correcta, o bien buscar cualquier caja abierta del restaurante si no se especifica cajero.

**7. CashShift: agregar `openingBalance`**
- Campo opcional para registrar el efectivo inicial en caja.
- Actualmente el sistema es digital-only, pero el campo permite soporte futuro de efectivo.
- Agregar: `openingBalance BigInt @default(0)` en ambos schemas.

**8. Contador de tickets: análisis y estrategia para multi-cajero**
- El contador actual (`lastOrderNumber` con `{ increment: 1 }`) es O(1) y atómico. NO hace COUNT — ya está optimizado.
- **El problema con multi-cajero**: cada CashShift tiene su propio `lastOrderNumber`. Con 2 cajeros abiertos, ambos generan ticket #1, #2, #3 independientemente. Los tickets no son globalmente únicos por día.
- **Estrategia recomendada (sin Redis por ahora)**: Mantener la secuencia por turno (`lastOrderNumber` en CashShift). El número de ticket se presenta como `#A-01`, `#B-01` usando un identificador del cajero, o simplemente por turno. Esto es el modelo estándar de restaurantes con múltiples cajas.
- **Si se necesita secuencia global diaria**: agregar un modelo `DailyCounter { restaurantId, date, lastNumber }` con un único `increment` atómico en transaction. Esto evita Redis y mantiene todo en PostgreSQL.
- **Redis quedaría reservado** para si la carga supera los miles de pedidos por minuto, lo cual es un problema de escala muy superior al rango de uso actual.
- **Conclusión**: no cambiar el contador ahora. Documentar que con multi-cajero los tickets son por turno, no globales.

---

## Aclaraciones sobre el modelo actual

**`subtotal` en OrderItem**: Correcto y justificado. Congela el precio al momento del pedido (si el precio del producto cambia después, el histórico queda intacto). También evita recalcular en cada query. Mantener.

**`menuItemId` en OrderItem**: Correcto. Permite analytics por menú (qué menú genera más ventas). Mantener como opcional.

**CashShift actual**: Cubre los requerimientos básicos de un restaurante digital (secuencia de órdenes por turno, totales, quién cerró). Le falta `openingBalance` para soportar efectivo eventualmente.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | `@@unique([cashShiftId, orderNumber])` en Order; `openingBalance` + `userId` en CashShift |
| `prisma/schema.postgresql.prisma` | Mismos cambios + unique partial index comentado para referencia |
| `src/cash-register/cash-register.service.ts` | Fix race en `openSession`; fix atomicidad en `closeSession` |
| `src/cash-register/cash-register-session.repository.ts` | Método `close` con aggregate en transaction; manejo de unique violation; `findOpen` acepta `userId` opcional |
| `src/orders/orders.service.ts` | Refactor `decrementAllStock` a UPDATE condicional |
| `src/orders/order.repository.ts` | `createWithItems` sin cambios necesarios |
| Migración Prisma nueva | Para SQLite dev schema |
| Migración PostgreSQL manual | Partial unique index `(restaurantId, userId) WHERE status='OPEN'` |

---

## Cambios detallados

### Fix 1: Partial unique index (PostgreSQL schema + service)

En `schema.postgresql.prisma`, agregar comentario de que existe el index manual.
En el service, envolver `create()` en try/catch del error de unique constraint de Prisma (`P2002`) y lanzar `CashRegisterAlreadyOpenException`.

```typescript
// cash-register.service.ts - openSession
async openSession(restaurantId: string): Promise<CashShift> {
  try {
    return await this.registerSessionRepository.create(restaurantId);
  } catch (e) {
    if (e?.code === 'P2002') throw new CashRegisterAlreadyOpenException();
    throw e;
  }
}
```

La migration de PostgreSQL necesita ejecutarse manualmente:
```sql
CREATE UNIQUE INDEX "one_open_shift_per_restaurant" 
ON "CashShift"("restaurantId") WHERE status = 'OPEN';
```

### Fix 2: Stock decrement condicional

```typescript
// orders.service.ts - decrementAllStock
private async decrementAllStock(stockEntries: StockEntry[], tx: Prisma.TransactionClient) {
  for (const { product, item } of stockEntries) {
    if (product.stock !== null) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (updated.count === 0) {
        throw new StockInsufficientException(product.name, product.stock, item.quantity);
      }
    }
  }
}
```

Esto hace el validate+decrement en una sola operación atómica. El `validateStock` previo en `validateAndBuildItems` puede eliminarse (era el check anticipado que ahora es redundante) o mantenerse como early-exit para mejor UX antes de entrar a la transaction.

### Fix 3: closeSession atómico

```typescript
async closeSession(restaurantId: string, closedBy?: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Cerrar primero (bloquea nuevas órdenes para este shift)
    const session = await tx.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
    });
    if (!session) throw new NoOpenCashRegisterException();

    // 2. Agregar totales directo en DB
    const agg = await tx.order.aggregate({
      where: { cashShiftId: session.id },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    // 3. Cerrar con totales calculados en DB
    return tx.cashShift.update({
      where: { id: session.id },
      data: {
        status: CashShiftStatus.CLOSED,
        closedAt: new Date(),
        closedBy,
        totalSales: agg._sum.totalAmount ?? 0n,
        totalOrders: agg._count.id,
      },
    });
  });
}
```

El `paymentBreakdown` del response puede calcularse con `groupBy` en la misma transaction o eliminarse del cierre y dejarse solo en `getSessionSummary`.

### Fix 4: Unique constraint en Order

```prisma
// schema.prisma y schema.postgresql.prisma
model Order {
  ...
  @@unique([cashShiftId, orderNumber])
  @@index([restaurantId, createdAt])
  @@index([cashShiftId])
}
```

### Fix 5: Top products con aggregate

```typescript
// Reemplazar el loop en memoria por:
const topProducts = await tx.orderItem.groupBy({
  by: ['productId'],
  where: { order: { cashShiftId: session.id, status: { not: 'CANCELLED' } } },
  _sum: { quantity: true, subtotal: true },
  orderBy: { _sum: { quantity: 'desc' } },
  take: 10,
});
```

### Fix 6: Multi-cajero — `userId` en CashShift

```prisma
model CashShift {
  id              String          @id @default(uuid())
  status          CashShiftStatus @default(OPEN)
  lastOrderNumber Int             @default(0)
  openingBalance  BigInt          @default(0)

  userId       String
  user         User      @relation(fields: [userId], references: [id])

  totalSales  BigInt?
  totalOrders Int?
  closedBy    String?

  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  orders Order[]

  openedAt DateTime  @default(now())
  closedAt DateTime?

  @@index([restaurantId, status])
}
```

Partial index PostgreSQL (reemplaza el anterior):
```sql
CREATE UNIQUE INDEX "one_open_shift_per_user_per_restaurant"
ON "CashShift"("restaurantId", "userId") WHERE status = 'OPEN';
```

`findOpen` en el repository acepta `userId?` opcional:
```typescript
async findOpen(restaurantId: string, userId?: string) {
  return this.prisma.cashShift.findFirst({
    where: { restaurantId, status: CashShiftStatus.OPEN, ...(userId ? { userId } : {}) },
  });
}
```

DTO de apertura recibe `openingBalance?: number` (centavos).

---

## Orden de implementación

1. Schema changes (ambos archivos Prisma): `userId` requerido + `openingBalance` en CashShift; `@@unique([cashShiftId, orderNumber])` en Order → aplicar con `prisma db push`
2. Fix `decrementAllStock` (Fix 2) — más crítico, afecta dinero
3. Fix `openSession` (Fix 1) — race condition de apertura, captura P2002
4. Fix `closeSession` (Fix 3) — atomicidad de cierre con aggregate
5. Fix top products con groupBy (Fix 5) — performance
6. Migration SQL manual para PostgreSQL: partial unique index multi-cajero
7. Actualizar `findOpen` para aceptar `userId?`

---

## Notas de desarrollo

- `userId` en CashShift es **requerido** — se recibe desde el JWT del usuario autenticado que abre la caja.
- Estamos en modo desarrollo sin clientes reales: **no se generan migraciones**. Se usa `prisma db push` para forzar el schema directo a la BD.

## Verificación

```bash
cd apps/api-core

# 1. Aplicar schema sin migración (force push)
pnpm exec prisma db push

# 2. Correr tests unitarios
pnpm test -- --testPathPattern="orders"
pnpm test -- --testPathPattern="cash-register"

# 3. Test manual: crear dos sesiones simultáneas (debe fallar la segunda con 409)
# 4. Test manual: crear orden con stock insuficiente concurrente
# 5. Verificar que closeSession retorna totales correctos
```
