# ADR: Refactor General de Módulos API Core

**Fecha:** 2026-03-08
**Estado:** Aprobado
**Alcance:** products, orders, kiosk, restaurants, events

---

## Contexto

El proyecto necesita mejoras transversales de calidad: cobertura de tests ≥80%, documentación, tipado estricto en controllers, validación de ownership por restaurante, y centralización de eventos WebSocket.

---

## Decisiones

### 1. Centralización de Eventos en `src/events/`

**Decisión:** Crear servicios de eventos por módulo dentro del folder `src/events/` existente.

```
events/
├── events.gateway.ts        (existente)
├── events.module.ts         (existente)
├── products.events.ts       (nuevo)
├── orders.events.ts         (nuevo)
└── kiosk.events.ts          (nuevo)
```

Cada archivo expone:
- Constantes de eventos como `const as const` para evitar magic strings
- Un `@Injectable()` service que recibe `EventsGateway` y expone métodos semánticos

**Alternativas rechazadas:**
- Servicios de eventos dentro de cada módulo → fragmentación, difícil de mantener
- Dejar los eventos directamente en los services → strings duplicados, sin tipado

---

### 2. Validación de Ownership via NestJS Guard

**Decisión:** Crear `RestaurantResourceGuard` en `src/common/guards/`.

El guard valida que el recurso (por `:id` del route param) pertenezca al `restaurantId` del JWT antes de ejecutar el handler. Elimina el patrón repetitivo `await this.findXAndThrowIfNotFound(id, restaurantId)` en los services.

**Alternativas rechazadas:**
- Interceptor → mismo poder pero más complejo de configurar por recurso
- Mantener en service → código duplicado en cada método

---

### 3. Constantes en `config.ts`

Agregar a `apps/api-core/src/config.ts`:

```ts
export const DEFAULT_CATEGORY_NAME = 'default';
```

Los string literals de `OrderStatus` (`'COMPLETED'`, `'CANCELLED'`, etc.) se reemplazan con el enum `OrderStatus` de Prisma, ya importado.

---

## Cambios por Módulo

### Products

| Archivo | Cambio |
|---|---|
| `config.ts` | Agregar `DEFAULT_CATEGORY_NAME` |
| `products.service.ts` | Usar `DEFAULT_CATEGORY_NAME`, inyectar `ProductEventsService`, eliminar `@Optional()` de gateway |
| `products.controller.ts` | Return types explícitos en todos los métodos |
| `categories.controller.ts` | Return types explícitos, `Role.BASIC` solo GET |
| `products.exceptions.ts` | Nuevo `InsufficientStockException` para `decrementStock` |

### Restaurants

| Archivo | Cambio |
|---|---|
| `restaurants.controller.ts` | **Nuevo** — endpoint `PATCH /v1/restaurants/name` (ADMIN only), response `{ slug: string }` |

### Kiosk

| Archivo | Cambio |
|---|---|
| `kiosk.service.ts` | Stock status como `const as const`, dividir `getMenuItems` en helpers privados |

### Orders

| Archivo | Cambio |
|---|---|
| `orders.service.ts` | Refactorizar `createOrder` en métodos privados, reemplazar string literals con enum `OrderStatus` |
| `orders.controller.ts` | Return types explícitos, inyectar `OrderEventsService` |

### Todos los módulos (transversal)

- Controllers con return types explícitos usando DTOs de respuesta
- `Role.BASIC` solo en endpoints `GET`
- Unit tests ≥80% de cobertura por módulo
- Documentación en `apps/api-core/docs/modules/<module>.md` con diagramas Mermaid
- Swagger: `@ApiOperation`, `@ApiResponse`, `@ApiBody` en cada endpoint

---

## Orden de Implementación

1. `src/events/` — base para todos los módulos
2. `src/common/guards/` — guard de ownership
3. `src/config.ts` — constantes
4. Módulo `products` (service + controller + categories + exceptions)
5. Módulo `restaurants` (nuevo controller)
6. Módulo `kiosk` (refactor service)
7. Módulo `orders` (refactor service + controller)
8. Tests, documentación y Swagger por módulo

---

## Consecuencias

- Mayor trazabilidad de eventos WebSocket
- Eliminación de magic strings en toda la codebase
- Ownership validation centralizada y reutilizable
- Codebase más testeable y documentada
