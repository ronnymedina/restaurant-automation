# ADR: Kitchen Display (Pantalla de Cocina)

**Fecha:** 2026-03-09
**Estado:** Aprobado
**Área:** `apps/api-core/src/kitchen/`, `apps/ui-dashboard/src/pages/kitchen/`

---

## Contexto

El restaurante necesita una pantalla dedicada para la cocina que muestre pedidos en tiempo real, permita avanzar su estado (CREATED→PROCESSING→COMPLETED) y cancelarlos, sin requerir login JWT. La pantalla opera sin intervención humana directa (no puede reiniciarse manualmente).

## Decisión

### Autenticación: Token por restaurante con expiración

- Se agrega `kitchenToken String? @unique` y `kitchenTokenExpiresAt DateTime?` al modelo `Restaurant`.
- El ADMIN genera el token desde el dashboard vía `POST /v1/kitchen/token/generate` (JWT requerido).
- La pantalla de cocina usa `?token=KITCHEN_TOKEN` en cada request HTTP y como credencial WebSocket.
- Expiración configurable vía `KITCHEN_TOKEN_EXPIRY_DAYS` (default: 60 días).

**Alternativa descartada:** Token derivado de slug + secreto de servidor (sin DB). Descartada porque no permite revocación granular por restaurante.

### Tiempo real: Socket.IO con room `kitchen:{restaurantId}`

- Se agrega una nueva room `kitchen:${restaurantId}` en `EventsGateway`.
- El gateway acepta autenticación por `{ kitchenToken, slug }` en el handshake.
- `OrderEventsService` emite `order:new` y `order:updated` a las rooms `restaurant:` y `kitchen:` simultáneamente.
- Esto evita polling y reutiliza infraestructura existente.

**Alternativa descartada:** Polling HTTP. Descartada porque el servidor ya tiene WebSocket funcionando.

### Resiliencia: Reconexión automática + notificación al dashboard

- Socket.IO reconecta automáticamente con backoff.
- Después de 4 intentos fallidos, la pantalla hace `POST /v1/kitchen/:slug/notify-offline?token=TOKEN`.
- El servidor emite `kitchen:offline` al dashboard (`restaurant:` room) para alertar al staff.
- La pantalla muestra overlay "Sin conexión. El equipo fue notificado." sin botones.

### Regla de negocio: Cocina puede completar sin verificar pago

- Se agrega `kitchenAdvanceStatus` en `OrdersService` que omite el check `isPaid` para COMPLETED.
- El dashboard conserva su regla original (COMPLETED requiere isPaid).
- Justificación: en el flujo de tótem, el cliente puede pagar después de que la cocina termine.

### Módulo: `KitchenModule` separado

- Responsabilidad única: operaciones de cocina autenticadas por token.
- No mezcla con KioskModule (solo lectura para clientes) ni con el dashboard (JWT).
