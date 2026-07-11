# Hallazgos durante pruebas de carga — api-core

Errores y comportamientos inesperados encontrados durante la ejecución de los escenarios k6. Cada entrada incluye el síntoma observado, la causa raíz identificada y el estado actual.

---

## [ERR-01] Deadlock en creación concurrente de órdenes

**Fecha:** 2026-05-06  
**Escenario:** stress.js (50 VUs) — detectado en logs, no en thresholds  
**Severidad:** Alta → **Resuelto**

### Síntoma

Al correr el escenario `stress.js` con 50 VUs, el endpoint `POST /v1/kiosk/:slug/orders` devuelve `500 Internal Server Error` de forma intermitente. Los logs del contenedor muestran:

```
code: '40P01'
severity: 'ERROR'
message: 'deadlock detected'
detail: 'Process 18119 waits for ShareLock on transaction 1384; blocked by process 18122.
         Process 18122 waits for ShareLock on transaction 1382; blocked by process 18119.'
```

### Causa raíz

El loop en `decrementAllStock` procesaba los items en el orden que llegaban en el request. Dos transacciones concurrentes con los mismos productos en distinto orden generaban un ciclo de locks:

```
Tx A (items: [P2, P1]): lock(P2) → esperando lock(P1) held by Tx B
Tx B (items: [P1, P2]): lock(P1) → esperando lock(P2) held by Tx A  ← deadlock
```

### Resolución

`orders.service.ts` — `decrementAllStock` ordenado por `productId` antes de ejecutar los `UPDATE`, garantizando que todas las transacciones adquieren locks en el mismo orden. Ver comentario en el código para la explicación completa.

### Verificación

`orders-with-stock.js` (50 VUs, 6.5 min): **4,858 órdenes creadas, 0 errores 500, 0 deadlocks**.

### Pendiente

- [ ] La contención en `CashShift.lastOrderNumber` sigue activa — ver ERR-05

---

## [ERR-02] Stock agotado invalida los tests de órdenes

**Fecha:** 2026-05-06  
**Escenario:** orders.js, concurrent-readwrite.js  
**Severidad:** Media → **Resuelto en tests**

### Síntoma

Al intentar crear órdenes con productos del pool de `PRODUCT_IDS` en `helpers/data.js`, el endpoint responde:

```json
{
  "message": "Insufficient stock for 'Pollo a la plancha 5'. Available: 0, requested: 2",
  "code": "STOCK_INSUFFICIENT",
  "statusCode": 409
}
```

### Causa raíz

El seed genera stock aleatorio. Los escenarios `load.js` y `stress.js` previos crearon órdenes reales que decrementaron el stock. Con 109k requests en el test de stress, varios productos llegaron a stock 0.

### Stock negativo — confirmado atómico

El decremento en `orders.service.ts:decrementAllStock` usa `updateMany` con `WHERE stock >= quantity`. El stock **no puede llegar a negativo**: si otra transacción ya consumió el stock entre el `findUnique` y el `updateMany`, el `count === 0` y se lanza `StockInsufficientException`. No hay race condition.

### Resolución en tests

Se crearon dos escenarios dedicados con reset de stock en `setup()`:

- `orders-with-stock.js` — reset a `stock=9999`, verifica 201. Prueba el happy path bajo carga.
- `orders-no-stock.js` — reset a `stock=0`, verifica 409. Prueba degradación graceful.

Nuevo helper `helpers/stock.js` con `fetchAllProductIds()` y `resetStock()`. Los IDs de productos se obtienen dinámicamente de la API en lugar de estar hardcodeados.

### Resultados `orders-no-stock.js` (40 VUs, 2m50s)

| Métrica | Valor |
|---------|-------|
| Órdenes intentadas | 4,306 |
| Rechazos 409 | 4,306 (100%) |
| p95 latencia kiosk | 18.5ms |
| Errores 500 | 0 |

El servidor rechaza órdenes sin stock en ~9ms promedio, sin contención ni degradación. El path de `stock=0` lanza excepción antes de llegar a los `UPDATE`, por lo que no genera locks.

### Pendiente

- [x] ~~Confirmar si el decremento de stock es atómico~~ — confirmado, es atómico
- [ ] Evaluar si el seed debería aceptar un flag `--stock <n>` para controlar el valor inicial en tests

---

## [ERR-03] Caja cerrada bloquea creación de órdenes

**Fecha:** 2026-05-06  
**Escenario:** orders.js, concurrent-readwrite.js  
**Severidad:** Alta → **Resuelto**

### Síntoma

`POST /v1/kiosk/:slug/orders` devuelve error si no hay una sesión de caja abierta. El escenario k6 de órdenes producía 0 órdenes creadas porque la caja estaba cerrada.

### Causa raíz

`KioskService.createOrder()` verifica que exista una `CashShift` con `status = OPEN`. Comportamiento intencional, pero no estaba contemplado en el setup de los tests.

### Resolución

Agregado `openCashRegister(token)` en `helpers/auth.js`. Llama `POST /v1/cash-register/open` y acepta `201` (abierta ahora) y `409` (ya estaba abierta) — idempotente. Incluido en `setup()` de:

- `orders.js`
- `orders-with-stock.js`
- `orders-no-stock.js`
- `concurrent-readwrite.js`

### Pendiente

- [x] ~~Agregar verificación de caja abierta al script `orders.js` en la función `setup()`~~ — resuelto
- [ ] Documentar en `testing.md` que la caja debe estar abierta antes de correr escenarios de órdenes

---

## [ERR-04] Prisma client desincronizado tras reset de DB

**Fecha:** 2026-05-06  
**Escenario:** Setup inicial tras reset de base de datos  
**Severidad:** Media — solo aplica en desarrollo, no en producción

### Síntoma

El comando `pnpm run cli seed` falla con:

```
The column `(not available)` does not exist in the current database.
```

### Causa raíz

Al resetear la DB sin rebuildearlo, el Prisma Client generado en la imagen Docker corresponde al schema anterior. Si el schema cambió, el client incluye referencias a columnas que ya no existen.

### Workaround

Regenerar el Prisma Client dentro del contenedor en ejecución:

```bash
docker compose exec res-api-core pnpm exec prisma generate --schema=prisma/schema.postgresql.prisma
```

También puede ser necesario hacer baseline de migraciones si la DB tiene tablas pero sin historial:

```bash
docker compose exec res-api-core pnpm exec prisma migrate resolve \
  --applied 20260503122416_init \
  --schema=prisma/schema.postgresql.prisma
```

### Pendiente

- [ ] Evaluar si el Dockerfile debería regenerar el client en el entrypoint en vez de en build time

---

## [ERR-05] Outlier de latencia bajo pico máximo de VUs

**Fecha:** 2026-05-06 (detectado) / 2026-05-06 (investigado con Jaeger)  
**Escenario:** stress.js (50 VUs), orders-with-stock.js (50 VUs)  
**Severidad:** Media — no supera thresholds pero indica contención real

### Síntoma original

Tests pasaron todos los thresholds pero el campo `max` mostraba outliers de 24–27s:

| Escenario | p95 | max |
|-----------|-----|-----|
| stress (original) | 26ms | 24.83s |
| orders-with-stock (con Jaeger) | 1.99s | 5.35s |

### Investigación con Jaeger

Trazas del endpoint `POST /v1/kiosk/:slug/orders` bajo 50 VUs identificaron **dos cuellos de botella**:

```
+89ms   BEGIN transaction
+101ms  SELECT products (findUnique ×N)         ~94ms
+238ms  UPDATE stock ×N                          ~10ms
+251ms  UPDATE CashShift.lastOrderNumber  →    336ms  ← lock wait
+592ms  INSERT Order + OrderItems               ~40ms
+627ms  COMMIT                                  ~55ms
--- fin transacción (+683ms) ---
+714ms  SELECT (generateBoth print service) →  816ms  ← await bloqueante
```

**Cuello 1 — `UPDATE CashShift.lastOrderNumber` (336ms de lock wait):**

`CashShift` es una fila compartida que todas las transacciones actualizan al final. Con 50 VUs concurrentes, las transacciones se serializan en la cola de ese lock. El fix del sort (ERR-01) eliminó los deadlocks entre productos, pero no esta serialización.

El pool de conexiones **no** era el cuello: `pg-pool.connect` mostró 0–2ms en todos los spans.

**Cuello 2 — `generateBoth` bloqueante (816ms):**

`orders.service.ts` hacía `await this.printService.generateBoth(order.id)` para incluir tickets en la respuesta. El comentario decía "never blocks" — incorrecto. Bajo carga el SELECT interno tardaba ~800ms, bloqueando la respuesta al kiosk.

### Resolución parcial

`generateBoth` deshabilitado en `orders.service.ts`. `receipt` y `kitchenTicket` retornan `null` hasta que se defina la arquitectura de impresión para cloud. Ver `docs/print-cloud.md`.

### Pendiente

- [x] ~~Verificar en Jaeger si el outlier es `pg-pool.connect` o lock en DB~~ — confirmado: lock en `CashShift`, pool no es el problema
- [x] ~~`generateBoth` bloqueante~~ — deshabilitado, documentado en `docs/print-cloud.md`
- [ ] Resolver contención en `CashShift.lastOrderNumber` — mover el contador fuera de la transacción (Postgres `SEQUENCE` o contador atómico) para que el `UPDATE CashShift` no serialice todas las órdenes concurrentes
- [ ] Configurar `lock_timeout` en Postgres para que transacciones bloqueadas aborten en lugar de esperar indefinidamente

---

## [ERR-06] Resultados de todos los escenarios ejecutados

### Ejecución original (2026-05-06)

| Escenario | VUs | Requests | Error rate | p95 | max | Estado |
|-----------|-----|----------|------------|-----|-----|--------|
| smoke | 2 | 181 | 0% | 21ms | 95ms | ✅ |
| load | 20 | 14,026 | 0% | 30ms | 152ms | ✅ |
| stress | 50 | 98,668 | 0% | 26ms | 24.83s | ✅ |
| orders | 50 | 3,756 | **97.17%** | 25ms | 1.44s | ❌ stock agotado |
| concurrent-readwrite | 28 | 3,054 | **73.05%** | kiosk:50ms / dash:120ms | 559ms | ❌ stock agotado |

### Ejecución post-fixes (2026-05-06)

| Escenario | VUs | Requests | Error rate | p95 | max | Estado |
|-----------|-----|----------|------------|-----|-----|--------|
| orders-with-stock | 50 | 4,858 | 0% | 541ms | 5.35s | ✅ |
| orders-no-stock | 40 | 4,306 | 0% (409 esperado) | 18.5ms | 53ms | ✅ |

### Interpretación post-fixes

- **Deadlocks eliminados** — 4,858 órdenes sin un solo error 500. El sort por `productId` resolvió el problema de lock ordering en productos.
- **Rechazos sin stock son rápidos y limpios** — p95 de 18.5ms confirma que el path de `stock=0` no genera contención. El servidor no se degrada bajo una carga masiva de órdenes inválidas.
- **Contención en `CashShift` persiste** — el `max` de 5.35s y el p95 de 541ms (con Jaeger activo) indican que la serialización del `lastOrderNumber` sigue siendo el cuello principal bajo 50 VUs. Es el único problema de infraestructura pendiente.
- **`generateBoth` eliminado del path crítico** — ya no bloquea la respuesta al kiosk.
