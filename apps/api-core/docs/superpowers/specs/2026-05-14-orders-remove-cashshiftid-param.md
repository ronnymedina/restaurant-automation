# Spec: Eliminar `cashShiftId` de `GET /v1/orders` y extraer `CashShiftModule`

**Fecha:** 2026-05-14
**Módulos afectados:** `orders`, `cash-register`, nuevo `cash-shift`

---

## Contexto

`GET /v1/orders` requiere `cashShiftId` como query param obligatorio. Esto genera un agujero de seguridad: cualquier usuario autenticado del restaurante puede pasar el ID de un turno cerrado anterior y consultar sus órdenes. Como en v1 solo puede haber **una caja abierta por restaurante a la vez**, el servidor puede resolver el turno activo internamente sin que el cliente provea ningún ID.

Adicionalmente, `CashRegisterModule` importa `OrdersModule` (para validar órdenes pendientes al cerrar caja). Si `OrdersModule` importara `CashRegisterModule` para obtener `CashShiftRepository`, habría una dependencia circular. La solución es extraer `CashShiftRepository` a un módulo independiente.

---

## Cambios de API

### `GET /v1/orders`

**Antes:**
```
GET /v1/orders?cashShiftId=<uuid>&statuses=CREATED&limit=50
```
`cashShiftId` requerido — provisto por el cliente.

**Después:**
```
GET /v1/orders?statuses=CREATED&limit=50
```
Sin `cashShiftId`. El servidor resuelve el turno abierto del restaurante usando el `restaurantId` del JWT.

**Casos de respuesta:**

| Caso | Status | Detalle |
|---|---|---|
| Hay caja abierta | 200 | `OrderDto[]` del turno activo |
| No hay caja abierta | 409 | `{ code: "REGISTER_NOT_OPEN" }` |
| Demás filtros (`statuses`, `limit`, `orderNumber`) | sin cambio | igual que antes |

---

## Nueva arquitectura de módulos

### Problema actual
```
CashRegisterModule → imports OrdersModule (usa OrderRepository)
OrdersModule       → necesita CashShiftRepository  → dependencia circular
```

### Solución: extraer `CashShiftModule`

```
src/cash-shift/
  cash-shift.repository.ts    ← movido desde cash-register/cash-register-session.repository.ts
  cash-shift.module.ts        ← nuevo
  cash-shift.module.info.md   ← documentación del módulo
```

**Grafo de dependencias resultante:**

```
CashShiftModule
  provides: CashShiftRepository
  exports:  CashShiftRepository
  imports:  (ninguno)

CashRegisterModule
  imports: CashShiftModule      ← reemplaza providers: [CashShiftRepository]
  imports: OrdersModule         ← sin cambio (necesita OrderRepository para validar cierre)
  exports: CashRegisterService  ← ya no exporta CashShiftRepository

OrdersModule
  imports: CashShiftModule      ← nuevo
  sin dependencia circular con CashRegisterModule
```

Sin `forwardRef`. Sin ciclo.

---

## Capa de servicio

`OrdersService.listOrders()` inyecta `CashShiftRepository` y resuelve el turno activo internamente:

```typescript
async listOrders(restaurantId, statuses?, limit?, orderNumber?) {
  const shift = await this.cashShiftRepository.findOpen(restaurantId);
  if (!shift) throw new RegisterNotOpenException();
  return this.orderRepository.listOrders(restaurantId, shift.id, statuses, limit, orderNumber);
}
```

`RegisterNotOpenException` ya existe en `orders/exceptions/orders.exceptions.ts` — responde con `HttpStatus.CONFLICT` (409) y código `REGISTER_NOT_OPEN`. No se crea excepción nueva.

`OrderRepository.listOrders()` no cambia su firma — sigue recibiendo `cashShiftId`.

---

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `cash-register/cash-register-session.repository.ts` | Mover a `cash-shift/cash-shift.repository.ts` |
| `cash-shift/cash-shift.module.ts` | Nuevo — provee y exporta `CashShiftRepository` |
| `cash-shift/cash-shift.module.info.md` | Nuevo — documenta el módulo |
| `cash-register/cash-register.module.ts` | Quita `CashShiftRepository` de providers, importa `CashShiftModule` |
| `cash-register/cash-register.service.ts` | Actualizar import path |
| `orders/orders.module.ts` | Importa `CashShiftModule` |
| `orders/orders.service.ts` | Inyecta `CashShiftRepository`, elimina `cashShiftId` de `listOrders()` |
| `orders/orders.controller.ts` | Elimina `@Query('cashShiftId')` y `ParseUUIDPipe` para ese param |
| `apps/ui/src/components/dash/orders/api.ts` | Quitar `cashShiftId` del payload de `getOrders()` |
| `apps/ui/src/components/dash/orders/api.test.ts` | Actualizar requests sin `cashShiftId` |
| `test/orders/listOrders.e2e-spec.ts` | Quitar `cashShiftId` de requests, agregar caso `NO_OPEN_CASH_SHIFT` |
| `orders/orders.service.spec.ts` | Mockear `CashShiftRepository.findOpen()` |
| `orders/orders.module.info.md` | Actualizar params y casos de error |

---

## Testing

### E2E — `listOrders.e2e-spec.ts`

Casos a agregar o modificar:

| Caso | Status | Detalle |
|---|---|---|
| Sin caja abierta | 409 | `{ code: "REGISTER_NOT_OPEN" }` |
| Con caja abierta, sin params | 200 | Retorna órdenes del turno activo |
| Con caja abierta, `?statuses=CREATED&statuses=PROCESSING` | 200 | Filtra por múltiples estados |
| Sin token | 401 | Sin cambio |

Eliminar todos los casos que construyen la URL con `?cashShiftId=`.

### Unit — `orders.service.spec.ts`

- Mock de `CashShiftRepository` con método `findOpen()`
- Caso: `findOpen` retorna `null` → `listOrders` lanza `RegisterNotOpenException`
- Caso: `findOpen` retorna shift → `listOrders` pasa `shift.id` al repositorio

---

## Frontend

`api.ts` — quitar `cashShiftId` del payload de `getOrders()`.

El componente `OrdersPanel` ya llama a `getCurrentSession()` antes de `getOrders()`, por lo que el caso normal "sin caja abierta" está cubierto. Sin embargo, existe una condición de carrera: la caja puede cerrarse entre el check de sesión y el llamado a `getOrders()`. Actualmente ese error falla en silencio (lista vacía sin mensaje).

**Cambio requerido en `OrdersPanel`:** cuando `getOrders()` retorna `{ ok: false }` con `httpStatus === 409` y `error.code === 'REGISTER_NOT_OPEN'`, setear el estado a `ORDERS_STATUS.CLOSED` en lugar de ignorar el error. Esto garantiza que el usuario vea el mensaje "caja cerrada" en lugar de una lista vacía sin explicación.

---

## Documentación del módulo nuevo

`cash-shift.module.info.md` debe documentar:
- Propósito: módulo de infraestructura para acceso a datos de turnos de caja
- Qué exporta: `CashShiftRepository`
- Consumidores: `CashRegisterModule`, `OrdersModule`
- Sin lógica de negocio — solo acceso a datos
