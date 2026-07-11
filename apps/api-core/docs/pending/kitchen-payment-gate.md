# Configuración: Gate de Pago en Cocina — Pendiente de Implementar

El módulo de cocina actualmente permite marcar pedidos como `COMPLETED` **sin verificar si están pagados**. Esto es intencional por diseño del flujo actual, pero no se adapta a todos los modelos de restaurante.

## Estado actual del código

En `apps/api-core/src/orders/orders.service.ts`, método `kitchenAdvanceStatus`:

```typescript
// Kitchen can complete without payment check — payment is handled by the cashier
const updated = await this.orderRepository.updateStatus(id, newStatus);
```

El flujo regular del dashboard (`updateOrderStatus`) sí exige `isPaid === true` antes de pasar a `COMPLETED`. La cocina tiene un bypass explícito.

## El problema

Existen dos modelos de pago distintos según el tipo de restaurante:

| Modelo | Flujo | ¿La cocina debe verificar pago? |
|--------|-------|----------------------------------|
| **Pago en caja** | Cliente ordena → cocina prepara → cocina entrega → cajero cobra | ❌ No — el pago ocurre después de que la cocina termina |
| **Pago por adelantado** | Cliente paga en kiosk o caja al ordenar → cocina prepara → cocina entrega | ✅ Sí — el pedido llega a la cocina ya pagado |

El modelo actual asume siempre el primer caso. El usuario quiere que esto sea configurable por restaurante.

## Feature a implementar

Agregar un campo de configuración al restaurante, por ejemplo `requirePaymentBeforeKitchenComplete: boolean` (nombre a definir), que controle si `kitchenAdvanceStatus` debe verificar `isPaid` antes de permitir la transición a `COMPLETED`.

### Comportamiento esperado

- Si `requirePaymentBeforeKitchenComplete = false` (default actual): la cocina puede completar el pedido sin importar el estado de pago. El cajero cobra después.
- Si `requirePaymentBeforeKitchenComplete = true`: la cocina recibe un error si intenta completar un pedido que no está marcado como pagado. El frontend de cocina debería mostrar un mensaje claro ("Este pedido aún no está pagado").

### Consideraciones de UX en la cocina

- La pantalla de cocina (`/kitchen`) no muestra actualmente el estado de pago de los pedidos. Si se habilita este gate, habría que mostrar un indicador visual en cada card cuando el pedido no está pagado.
- El mensaje de error desde el API debe ser descriptivo para que el frontend pueda distinguirlo de otros errores.

## Lo que hay que definir antes de implementar

- **Nombre del campo** en el modelo `Restaurant` (Prisma schema + migración).
- **Dónde se configura** en el dashboard: ¿en la sección de configuración del restaurante, o junto a las opciones de caja registradora?
- **Valor por defecto**: `false` para mantener compatibilidad con el comportamiento actual de todos los restaurantes existentes.
- **UX del indicador de pago** en la pantalla de cocina cuando el gate está habilitado.

## Archivos relevantes

- `apps/api-core/src/orders/orders.service.ts` — método `kitchenAdvanceStatus` (línea ~152)
- `apps/api-core/src/restaurants/` — modelo y servicio donde iría el nuevo campo
- `apps/ui-dashboard/src/pages/kitchen/index.astro` — frontend de cocina (función `renderCard`)
- Schema Prisma: `packages/database/prisma/schema.prisma` (verificar ruta exacta)
