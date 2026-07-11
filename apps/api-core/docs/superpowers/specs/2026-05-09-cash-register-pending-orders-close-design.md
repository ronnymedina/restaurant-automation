# Cash Register — Bloqueo de cierre con pedidos pendientes

**Fecha:** 2026-05-09
**Módulo:** `cash-register`
**Estado:** Implementado

---

## Visión general

Cuando un cajero intenta cerrar la caja, el sistema verifica que todos los pedidos del turno estén en estado resuelto (`COMPLETED` o `CANCELLED`). Si hay pedidos activos (`CREATED` o `PROCESSING`), el cierre se bloquea con un error claro que indica cuántos pedidos quedan pendientes. El cajero debe resolverlos uno a uno antes de poder cerrar.

No existe override — el bloqueo es absoluto. Esto garantiza que el resumen de la caja siempre refleje la realidad completa del turno, y prepara el terreno para la futura integración de pagos.

---

## Reglas de negocio

### Estados de un pedido

| Estado | Significado | ¿Bloquea cierre? |
|--------|-------------|------------------|
| `CREATED` | Pedido creado, no en cocina aún | ✅ Sí |
| `PROCESSING` | En preparación en cocina | ✅ Sí |
| `COMPLETED` | Entregado y finalizado | ❌ No |
| `CANCELLED` | Cancelado por cualquier motivo | ❌ No |

**Regla:** Un turno solo puede cerrarse cuando `count(CREATED + PROCESSING) == 0` para ese `cashShiftId`.

### Motivación futura (pagos)

- Un pedido `CREATED` podría ya haber sido cobrado antes de que el cajero lo atienda. Si la caja cierra con ese pedido pendiente, el dinero no aparece en el resumen del turno — discrepancia directa.
- Un pedido `CANCELLED` podría haber sido pagado previamente. En ese caso se necesitaría un reembolso, y ese movimiento debe quedar registrado dentro del turno donde ocurrió el pago original, no en uno posterior.

El bloqueo actual protege ambos casos: obliga a que todos los pedidos activos queden en estado terminal antes del cierre, asegurando que el resumen del turno sea auditablemente correcto cuando existan pagos reales.

---

## Contrato de API

**Endpoint:** `POST /v1/cash-register/close`

### Flujo exitoso (sin pedidos pendientes)

```
200 OK
```
```json
{
  "session": { "status": "CLOSED", "closedAt": "...", "totalOrders": 3, "totalSales": "..." },
  "summary": {
    "totalOrders": 3,
    "totalSales": 150.00,
    "paymentBreakdown": { "CASH": { "count": 2, "total": 100.00 }, "CARD": { "count": 1, "total": 50.00 } }
  }
}
```

### Flujo de bloqueo (pedidos activos en el turno)

```
409 Conflict
```
```json
{
  "code": "PENDING_ORDERS_ON_SHIFT",
  "message": "Cannot close register: 2 pending order(s) must be completed or cancelled first",
  "statusCode": 409,
  "details": {
    "pendingCount": 2
  }
}
```

### Otros errores del módulo

| Código | Status | Condición |
|--------|--------|-----------|
| `NO_OPEN_REGISTER` | 409 | No hay turno abierto |
| `REGISTER_ALREADY_OPEN` | 409 | Intento de abrir cuando ya hay uno activo |

### Orden de validación en `closeSession`

1. ¿Existe turno abierto? → lanza `NoOpenCashRegisterException` (`NO_OPEN_REGISTER`)
2. ¿Hay pedidos con `CREATED` o `PROCESSING`? → lanza `PendingOrdersException` (`PENDING_ORDERS_ON_SHIFT`)
3. Agrega totales y cierra el turno → retorna `session` + `summary`

---

## Implementación

### Backend — `cash-register.service.ts`

Dentro de la transacción de `closeSession`, inmediatamente después de encontrar el turno abierto:

```ts
const pendingCount = await tx.order.count({
  where: {
    cashShiftId: session.id,
    status: { in: [OrderStatus.CREATED, OrderStatus.PROCESSING] },
  },
});
if (pendingCount > 0) throw new PendingOrdersException(pendingCount);
```

### Excepción — `cash-register.exceptions.ts`

```ts
export class PendingOrdersException extends BaseException {
  constructor(pendingCount: number) {
    super(
      `Cannot close register: ${pendingCount} pending order(s) must be completed or cancelled first`,
      HttpStatus.CONFLICT,
      'PENDING_ORDERS_ON_SHIFT',
      { pendingCount },
    );
  }
}
```

### Frontend — `register.astro`

En `closeRegister()`, al recibir un error del endpoint:

```ts
if (err?.code === 'PENDING_ORDERS_ON_SHIFT') {
  const count = err.details?.pendingCount ?? 'algunos';
  alert(`No puedes cerrar la caja: hay ${count} pedido(s) pendiente(s).\nCompleta o cancela los pedidos antes de cerrar.`);
} else {
  alert(err?.message || 'Error al cerrar caja');
}
```

---

## Casos de test

### Unit tests — `cash-register.service.spec.ts`

| Caso | Setup | Resultado esperado |
|------|-------|--------------------|
| Sin turno abierto | `cashShift.findFirst` → null | Lanza `NoOpenCashRegisterException` |
| Pedidos en `CREATED` | `order.count` → 2 | Lanza `PendingOrdersException` con `pendingCount: 2` |
| Pedidos en `PROCESSING` | `order.count` → 1 | Lanza `PendingOrdersException` con `pendingCount: 1` |
| Solo `COMPLETED` + `CANCELLED` | `order.count` → 0 | Cierra turno, retorna `session` + `summary` |
| Sin pedidos | `order.count` → 0, aggregate sum null | Cierra con `totalSales: 0`, `totalOrders: 0` |

### E2E tests — `closeSession.e2e-spec.ts`

| Caso | Setup | Resultado esperado |
|------|-------|--------------------|
| Sin token | — | 401 |
| Rol `BASIC` | — | 403 |
| Sin sesión abierta | Restaurante sin turno | 409 `NO_OPEN_REGISTER` |
| Pedido `CREATED` pendiente | Turno + orden `CREATED` | 409 `PENDING_ORDERS_ON_SHIFT`, `details.pendingCount: 1` |
| Pedido `PROCESSING` pendiente | Turno + orden `PROCESSING` | 409 `PENDING_ORDERS_ON_SHIFT`, `details.pendingCount: 1` |
| Pedidos resueltos | Turno + orden `COMPLETED` | 200, `session.status: CLOSED`, `summary.totalOrders: 1` |

### UI

| Caso | Resultado esperado |
|------|--------------------|
| API retorna `PENDING_ORDERS_ON_SHIFT` | Alert: "No puedes cerrar la caja: hay N pedido(s) pendiente(s). Completa o cancela los pedidos antes de cerrar." |
| Cualquier otro error | Alert con `err.message` o mensaje genérico |
| Cierre exitoso | Modal con resumen del turno (totalOrders, totalSales, paymentBreakdown) |

---

## Archivos a actualizar

Toda modificación al comportamiento de un endpoint debe reflejarse en el archivo `*.module.info.md` del módulo correspondiente. Estos archivos son la fuente de verdad de cada módulo: contratos de respuesta, casos de error, notas de implementación.

En este caso:

| Archivo | Qué actualizar |
|---------|----------------|
| `src/cash-register/cash-register.module.info.md` | Añadir caso `PENDING_ORDERS_ON_SHIFT` en la sección `Close — POST /v1/cash-register/close` |

Si en el futuro se agregan módulos relacionados (ej. `orders` con un estado de forzar-completar), sus `*.module.info.md` también deben actualizarse.

---

## Decisiones de diseño

- **Sin override de cierre.** No existe un flag `force` ni un rol que permita saltarse la validación. La integridad del turno no es negociable.
- **El cajero resuelve manualmente, uno a uno.** No hay cancelación automática en masa. Un pedido `CREATED` podría ya haber sido cobrado (con pagos futuros) — cancelarlo automáticamente sería un reembolso implícito sin control.
- **`pendingCount` en el error.** Se devuelve el número exacto de pedidos pendientes para que el UI pueda mostrarlo sin hacer una llamada adicional.
- **La verificación ocurre dentro de la transacción.** El `count` y el `update` del turno están en el mismo `$transaction`, eliminando la race condition donde un pedido se crea justo antes de que el turno cierre.
