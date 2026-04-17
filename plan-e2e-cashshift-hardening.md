# Plan: Tests E2E para hardening de Order/CashShift

## Contexto

El PR de hardening (`feature/order-cashshift-hardening`) implementó fixes de concurrencia y performance sobre los módulos `cash-register` y `orders`. Todos los tests actuales son **unitarios con mocks**. Este plan agrega cobertura e2e/integración que valida el comportamiento real contra PostgreSQL.

## Cambios que requieren validación e2e

| Fix | Riesgo sin e2e |
|-----|----------------|
| `decrementAllStock` → UPDATE condicional atómico | Race condition de stock solo se manifiesta con requests concurrentes reales |
| `openSession` → captura P2002 del partial index | El index no existe en SQLite dev; la captura solo aplica en PostgreSQL |
| `closeSession` → `$transaction` atómico con aggregate | Totales incorrectos si llegan órdenes durante el cierre |
| `findOpen` con `userId` | Multi-cajero: validar que dos cajeros pueden abrir cajas simultáneas |
| `@@unique([cashShiftId, orderNumber])` | Solo verificable con DB real |

---

## Tests a implementar

### 1. Test de stock concurrente (crítico)

**Escenario:** Producto con stock = 1. Dos requests simultáneos intentan ordenar 1 unidad cada uno. Solo uno debe tener éxito.

```typescript
it('should reject concurrent orders when stock is 1', async () => {
  // Setup: producto con stock = 1
  // Act: 2 requests paralelos con Promise.all
  // Assert: exactamente 1 éxito (201) y 1 fallo (409/400 StockInsufficient)
  // Assert: stock final en DB = 0
});
```

### 2. Test de apertura de caja concurrente (crítico)

**Escenario:** Dos requests simultáneos intentan abrir caja para el mismo (restaurantId, userId). Solo uno debe tener éxito.

**Requiere:** Partial unique index en PostgreSQL:
```sql
CREATE UNIQUE INDEX "one_open_shift_per_user_per_restaurant"
ON "CashShift"("restaurantId", "userId") WHERE status = 'OPEN';
```

```typescript
it('should reject concurrent openSession for same user', async () => {
  // Act: 2 requests paralelos
  // Assert: 1 éxito (201), 1 fallo (409 REGISTER_ALREADY_OPEN)
});
```

### 3. Test de cierre atómico con órdenes concurrentes

**Escenario:** Se cierra la caja mientras llegan órdenes. Los totales deben reflejar exactamente las órdenes que entraron antes del cierre.

```typescript
it('should compute correct totals even with concurrent orders during close', async () => {
  // Difícil de garantizar timing — usar serialización o DB locks
  // Assert: totalOrders y totalSales en la sesión cerrada son consistentes
});
```

### 4. Test de unicidad de orderNumber por turno

**Escenario:** Múltiples órdenes en el mismo turno deben tener números únicos.

```typescript
it('should not allow duplicate orderNumber within same cashShift', async () => {
  // Assert: constraint @@unique([cashShiftId, orderNumber]) activo
  // Intentar insertar duplicado directo via Prisma debe fallar con P2002
});
```

### 5. Test de multi-cajero

**Escenario:** Usuario A y Usuario B abren cajas simultáneamente en el mismo restaurante. Ambas deben existir.

```typescript
it('should allow two users to have open sessions simultaneously', async () => {
  // userA.openSession() → 201
  // userB.openSession() → 201
  // Assert: 2 CashShifts OPEN en DB para el mismo restaurantId
});

it('should close only the requesting user session', async () => {
  // userA y userB con sesiones abiertas
  // userA.closeSession() → cierra solo la de A
  // userB.session sigue OPEN
});
```

### 6. Test de `getSessionSummary` top products con groupBy

**Escenario:** Verificar que el groupBy en DB devuelve los mismos resultados que el loop en memoria anterior.

```typescript
it('should return top 10 products sorted by quantity, excluding cancelled orders', async () => {
  // Seed: 15 productos distintos en órdenes de un turno, algunas CANCELLED
  // Assert: solo 10 resultados, ordenados por quantity desc, sin productos de órdenes canceladas
});
```

---

## Setup requerido

### Base de datos para tests

Opción A: Docker Compose con PostgreSQL para tests e2e:
```yaml
# docker-compose.test.yml
services:
  db-test:
    image: postgres:16
    environment:
      POSTGRES_DB: restaurants_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
```

Opción B: Usar `testcontainers-node` para levantar PostgreSQL per-test.

### Partial index en test DB

El partial index debe aplicarse como parte del setup del test:
```sql
CREATE UNIQUE INDEX "one_open_shift_per_user_per_restaurant"
ON "CashShift"("restaurantId", "userId") WHERE status = 'OPEN';
```

Esto puede ir en un `globalSetup` de Jest o en una migración de test.

### Framework sugerido

- NestJS `@nestjs/testing` + `supertest` (ya existe para e2e)
- `jest` con `--runInBand` para tests de concurrencia (evita workers paralelos que interfieren entre sí)
- `prisma migrate deploy` sobre la DB de test antes de cada suite

---

## Orden de implementación

1. Configurar Docker Compose + DB de test PostgreSQL
2. Aplicar schema + partial index en DB de test
3. Implementar helper de seed (crear restaurante, usuarios, productos)
4. Test de stock concurrente (Fix 2)
5. Test de apertura concurrente + partial index (Fix 1)
6. Test de multi-cajero (Fix 6)
7. Test de cierre atómico (Fix 3)
8. Test de uniqueness de orderNumber (Fix 4)
9. Test de top products (Fix 5)

---

## Notas

- Los tests de concurrencia son inherentemente no-deterministas; usar reintentos o `Promise.allSettled` con assertions sobre el conjunto de resultados.
- El partial index es la pieza crítica que NO está cubierta por ningún test unitario actual.
- SQLite (dev local) no soporta partial indexes — los tests e2e deben correr siempre contra PostgreSQL.
