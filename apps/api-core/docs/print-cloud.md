# Print service — situación actual y decisión pendiente

## Contexto

El módulo `print` (`src/print/`) fue diseñado para un entorno **local/Electron**, donde el servidor API corre en la misma máquina que la impresora física. Genera dos tipos de documentos:

- **`receipt`** — ticket de cliente (recibo de la orden)
- **`kitchenTicket`** — comanda para cocina

Hay tres flujos de impresión activos:

| Flujo | Dónde | Comportamiento |
|-------|-------|----------------|
| `printKitchenTicket(orderId)` | `createOrder` | Fire-and-forget. Dispara al crear la orden. |
| `printReceipt(orderId)` | `markAsPaid` | Fire-and-forget. Dispara al marcar como pagada. También en `createOrder` si `PRINT_CUSTOMER_ON_CREATE=true`. |
| `generateBoth(orderId)` | `createOrder` | **Bloqueante**. Retorna receipt + kitchenTicket en el body de la respuesta al kiosk. |

## El problema

`generateBoth` está `await`-eado en `orders.service.ts`, lo que significa que **el kiosk espera a que el print service termine antes de recibir la confirmación de la orden**. Bajo carga concurrente (50 VUs), ese SELECT tarda ~800ms según las trazas de Jaeger, sumando directamente a la latencia percibida por el cliente.

```
Traza Jaeger — createOrder (1540ms total):
  ...
  Transacción Prisma            683ms
  generateBoth → SELECT         816ms  ← bloqueando la respuesta HTTP
```

El comentario en el código decía "null-safe, never blocks" — incorrecto. El `await` sí bloquea.

## Decisión tomada

`generateBoth` está **deshabilitado temporalmente** en `orders.service.ts`:

```typescript
// TODO(print-cloud): generateBoth is disabled — see docs/print-cloud.md
// const tickets = await this.printService.generateBoth(order.id).catch(() => null);

return {
  order,
  receipt: null,       // ← siempre null hasta que se resuelva el diseño cloud
  kitchenTicket: null,
};
```

El kiosk UI debe manejar `receipt: null` y `kitchenTicket: null` sin romper. Si actualmente depende de estos campos en la respuesta de creación de orden, hay que ajustarlo.

## Opciones para cloud

### Opción A — Polling desde el frontend
El kiosk recibe la confirmación inmediatamente (`order`). Si necesita el recibo para mostrarlo, hace un `GET /v1/kiosk/:slug/orders/:id` separado unos segundos después. El servidor genera el recibo bajo demanda en esa llamada, no en el flujo de creación.

**Pro:** Respuesta de creación instantánea. Simple de implementar.  
**Contra:** El kiosk necesita una segunda llamada si quiere mostrar el recibo al cliente.

### Opción B — Generación asíncrona con WebSocket push
La orden se crea y confirma al kiosk inmediatamente. El servidor genera los tickets en background y los empuja vía WebSocket cuando están listos.

**Pro:** El cliente recibe el recibo sin hacer polling. Mejor UX.  
**Contra:** Requiere que el kiosk esté suscrito al evento de ticket generado. Mayor complejidad.

### Opción C — Endpoint dedicado de generación
Agregar `POST /v1/kiosk/:slug/orders/:id/tickets` que genera y retorna receipt + kitchenTicket bajo demanda. El kiosk llama este endpoint solo si necesita mostrar el recibo (ej. para imprimir en la nube o mostrar en pantalla).

**Pro:** Separación clara de responsabilidades. El flujo de creación no toca el print service.  
**Contra:** Una llamada extra si el kiosk siempre muestra el recibo.

## Pendiente

- [ ] Definir si el kiosk en cloud necesita mostrar el recibo al cliente y en qué momento
- [ ] Evaluar si `printKitchenTicket` y `printReceipt` (fire-and-forget) tienen sentido en cloud o deben desactivarse también
- [ ] Elegir entre opciones A, B o C e implementar
- [ ] Una vez decidido, actualizar el comentario `TODO(print-cloud)` en `orders.service.ts`
