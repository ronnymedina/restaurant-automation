# ADR: Impresión Automática al Crear una Orden

**Fecha:** 2026-03-09
**Estado:** Aprobado
**Área:** `apps/api-core/src/print/`, `apps/api-core/src/orders/`

---

## Contexto

Al crear una orden se debe imprimir automáticamente un ticket de cocina (sin precios, para preparación) y generar un receipt para el frontend (para mostrar en pantalla si no hay impresora física). La impresión no debe bloquear el flujo de creación de la orden.

## Decisión

### Integración: Llamada directa en OrdersService (fire-and-forget)

- `OrdersService.createOrder` llama `printService.printKitchenTicket(order.id)` como fire-and-forget (`void promise.catch(warn)`).
- Si la impresión falla, se loggea un warning pero la orden se retorna exitosamente.
- No se usa NestJS EventEmitter para este caso: el `forwardRef` entre OrdersModule y PrintModule ya existe.

**Alternativa descartada:** NestJS EventEmitter (`@OnEvent`). Descartada por ser over-engineering para un único trigger.

### Response enriquecido: `{ order, receipt, kitchenTicket }`

- `createOrder` retorna `{ order, receipt: Receipt | null, kitchenTicket: KitchenTicket | null }`.
- El frontend del tótem usa el `receipt` para mostrar resumen visual al cliente si no hay impresora.
- Si la generación falla, los campos son `null` (no bloquea la respuesta).

### Dos tipos de ticket

| Campo | Receipt (cliente) | KitchenTicket (cocina) |
|-------|-------------------|----------------------|
| Nombre restaurante | ✓ | ✗ |
| Número de orden | ✓ | ✓ |
| Items + cantidades | ✓ | ✓ |
| Notas por item | ✓ | ✓ |
| Precios / total | ✓ | **✗** |
| Método de pago | ✓ | ✗ |

### Impresión física: stub con Logger

- `printKitchenTicket` y `printReceipt` siguen siendo stubs con `Logger`.
- Preparado para integrar ESC/POS en el futuro vía `PRINTER_ENABLED=true`.
- La interfaz ya está abstraída — solo se reemplaza el cuerpo del método.
