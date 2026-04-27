# Diseño: Reemplazo de WebSocket (Socket.IO) por SSE

**Fecha:** 2026-04-26  
**Estado:** Aprobado

## Contexto

El sistema usa Socket.IO para notificar al frontend de cambios en el backend (nuevos pedidos, cambios en el catálogo). El frontend solo usa los eventos como señales de invalidación — nunca usa el payload — y llama a un fetch completo al recibirlos. WebSocket es overkill para este patrón unidireccional.

## Objetivo

Reemplazar Socket.IO por Server-Sent Events (SSE), manteniendo la misma estructura de archivos desacoplados en el backend y centralizando la lógica de reconexión en un componente React reutilizable en el frontend.

## Qué NO cambia

- Los archivos `orders.events.ts`, `products.events.ts`, `kiosk.events.ts` siguen existiendo con la misma interfaz pública.
- El comportamiento del kiosk no cambia — actualmente no usa WebSocket en el frontend, y eso se mantiene igual.
- La autenticación del dashboard (JWT) y de la cocina (kitchen token via query param) se mantiene.

---

## Backend

### Estructura del módulo `events`

```
apps/api-core/src/events/
  events.module.ts          # sin cambios estructurales
  sse.service.ts            # reemplaza events.gateway.ts
  events.controller.ts      # NUEVO — endpoints @Sse()
  orders.events.ts          # mismo contrato público, inyecta SseService
  products.events.ts        # mismo contrato público, inyecta SseService
  kiosk.events.ts           # mismo contrato público, inyecta SseService
```

`events.gateway.ts` se elimina. Los archivos de spec existentes se actualizan acorde.

### `SseService`

Mantiene dos `Subject` globales de RxJS:
- `restaurant$` — para eventos del dashboard
- `kitchen$` — para eventos de la cocina

Cada mensaje incluye `restaurantId` para filtrar en el endpoint correspondiente.

```ts
interface SseEvent {
  restaurantId: string;
  event: string;
  data: unknown;
}

class SseService {
  emitToRestaurant(restaurantId: string, event: string, data: unknown): void
  emitToKitchen(restaurantId: string, event: string, data: unknown): void
  streamForRestaurant(restaurantId: string): Observable<MessageEvent>
  streamForKitchen(restaurantId: string): Observable<MessageEvent>
}
```

### Constantes de eventos

Los nombres de eventos se definen como constantes en el backend (ya existen en `orders.events.ts`, `products.events.ts`, etc.) y se espejean en el frontend en un archivo dedicado:

```
apps/ui/src/lib/sse-events.ts
```

Este archivo exporta las mismas constantes que el backend, de manera que ninguna página ni componente usa strings literales:

```ts
// apps/ui/src/lib/sse-events.ts
export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

export const CATALOG_EVENTS = {
  CHANGED: 'catalog:changed',
} as const;
```

El componente `SseConnection` y todos los consumidores importan desde `sse-events.ts`. Si un nombre de evento cambia, se actualiza en el backend y en ese único archivo del frontend.

### `EventsController`

Dos endpoints SSE, marcados como `@Public()` a nivel de JWT guard pero con su propia validación interna:

```
GET /v1/events/dashboard
  - Autenticación: JWT estándar (JwtAuthGuard aplicado globalmente)
  - Filtra stream por restaurantId extraído del token

GET /v1/events/kitchen
  - Query params: slug, token (kitchen token)
  - Autenticación: valida kitchen token + slug contra la BD (igual que el gateway actual)
  - @Public() — sin JWT
  - Filtra stream por restaurantId del restaurante encontrado
```

Ambos endpoints devuelven `Content-Type: text/event-stream` con eventos en formato SSE estándar:

```
event: order:new
data: {}

event: order:updated
data: {}
```

### Event services — cambio interno

`orders.events.ts`, `products.events.ts`, `kiosk.events.ts` inyectan `SseService` en vez de `EventsGateway`. La interfaz pública (métodos como `emitOrderCreated`, `emitProductUpdated`, etc.) no cambia — solo la implementación interna.

`menus.service.ts` y `menu-items.service.ts` actualmente inyectan `EventsGateway` directamente (con `@Optional()`). Se actualizan para inyectar `SseService` con el mismo patrón opcional.

---

## Frontend

### Componente `SseConnection`

**Ubicación:** `apps/ui/src/components/commons/SseConnection.tsx`

Componente React que encapsula toda la lógica de conexión SSE y reconexión. El consumidor no maneja nada del estado de conexión.

**Props:**

```ts
interface SseConnectionProps {
  url: string;                              // endpoint SSE
  authHeader?: string;                      // "Bearer <token>" si requiere JWT
  events: string[];                         // nombres de eventos a escuchar
  onEvent: (event: string, data: unknown) => void;
  onConnect?: () => void;                   // llamado al conectar/reconectar
  maxRetries?: number;                      // default: 5
  retryDelay?: number;                      // segundos base de espera, default: 3
}
```

**Comportamiento interno:**

El componente gestiona el `EventSource` manualmente (no usa la reconexión automática del browser) para poder mostrar el countdown y controlar el backoff.

Estados internos: `connected | reconnecting | failed`

- `connected`: no muestra nada
- `reconnecting`: banner fijo en la parte superior: _"Reconectando en X segundos..."_ con countdown descendente
- `failed` (después de `maxRetries` intentos): banner más prominente: _"Sin conexión. Contactá a soporte si el problema persiste."_

Al conectar exitosamente: llama `onConnect?.()`, suscribe a los eventos listados en `events`, llama `onEvent` por cada uno. Al desmontar: cierra el `EventSource`.

**Nota sobre `EventSource` y autenticación:** `EventSource` nativo no soporta headers custom. Para el dashboard (JWT), se pasa el token como query param: `/v1/events/dashboard?token=<jwt>`. El controller lo acepta via query param además de header `Authorization`.

### Uso en páginas

```tsx
import { ORDER_EVENTS } from '../../lib/sse-events';

// dash/orders.astro — dentro del <script> existente
<SseConnection
  url={`/v1/events/dashboard?token=${token}`}
  events={[ORDER_EVENTS.NEW, ORDER_EVENTS.UPDATED]}
  onEvent={() => loadOrders()}
/>

// kitchen/index.astro
<SseConnection
  url={`/v1/events/kitchen?slug=${slug}&token=${token}`}
  events={[ORDER_EVENTS.NEW, ORDER_EVENTS.UPDATED]}
  onEvent={() => loadOrders()}
  onConnect={() => setConnected()}
/>
```

### Archivos eliminados

- `apps/ui/src/lib/socket.ts` — eliminado completamente
- Dependencia `socket.io-client` — eliminada del `package.json` de `apps/ui`
- Dependencia `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` — eliminadas de `apps/api-core`

---

## Qué se elimina del backend

- `events/events.gateway.ts`
- Rooms de Socket.IO (`restaurant:*`, `kitchen:*`, `kiosk:*`)
- Handshake de autenticación via Socket.IO
- El evento `kitchen:offline` → `emitToRestaurant` desde `kitchen.service.ts` se mantiene via SSE al canal restaurant

---

## Testing

Los archivos de spec existentes (`orders.events.spec.ts`, `products.events.spec.ts`, `kiosk.events.spec.ts`) se actualizan para mockear `SseService` en vez de `EventsGateway`. La interfaz de test es idéntica — se verifica que se llame al método correcto con los args correctos.

El `SseService` en sí tiene tests unitarios que verifican que los `Subject` emiten correctamente y que el filtro por `restaurantId` funciona.

---

## Dependencias a remover

| Paquete | App |
|---|---|
| `socket.io` | `api-core` |
| `@nestjs/websockets` | `api-core` |
| `@nestjs/platform-socket.io` | `api-core` |
| `socket.io-client` | `ui` |
