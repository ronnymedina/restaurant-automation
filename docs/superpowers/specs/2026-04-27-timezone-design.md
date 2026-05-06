# Timezone por Restaurante — Spec de Diseño

**Fecha:** 2026-04-27  
**Estado:** Aprobado

## Contexto

La aplicación actualmente usa un timezone global (`TZ` env var) para toda la lógica horaria. El sistema opera en dos modos: desktop/Electron con SQLite (un solo restaurante) y cloud con PostgreSQL (multi-restaurante). Se requiere que cada restaurante tenga su propio timezone IANA para que la lógica de negocio y el display de fechas sean correctos independientemente de la ubicación geográfica.

## Decisiones de diseño

- **Dónde almacenar:** en `RestaurantSettings`, no en `Restaurant` — es configuración, no dato maestro.
- **Invariante:** no puede existir un `Restaurant` sin su `RestaurantSettings`. Se crea en la misma transacción.
- **Almacenamiento de fechas:** los `DateTime` siguen en UTC en la DB. El timezone solo aplica al leer/mostrar y en lógica que depende del momento actual.
- **Cache:** abstracción genérica con dos implementaciones según entorno.

---

## 1. Base de datos

**Migración:** agregar `timezone String @default("UTC")` a `RestaurantSettings`.

```prisma
model RestaurantSettings {
  id           String     @id @default(uuid())
  restaurantId String     @unique
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])

  timezone              String    @default("UTC")
  kitchenToken          String?   @unique
  kitchenTokenExpiresAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Invariante:** `RestaurantsService.createRestaurant()` siempre crea `RestaurantSettings` en la misma transacción Prisma. Si en runtime se detecta un restaurante sin settings, se lanza `InternalServerErrorException` con mensaje claro.

---

## 2. CacheModule

Módulo NestJS independiente que encapsula toda la lógica de cache. Los módulos consumidores no saben qué implementación se usa.

### Estructura

```
src/cache/
├── cache.interface.ts          → ICacheService
├── in-memory-cache.service.ts  → implementación Map
├── redis-cache.service.ts      → implementación Redis
└── cache.module.ts             → provider dinámico + export
```

### Interfaz

```ts
export interface ICacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export const CACHE_SERVICE = 'CACHE_SERVICE';
```

### Selección de implementación

Controlada por `CACHE_DRIVER=memory|redis` en `config.ts`. El `CacheModule` usa un provider de fábrica:

```ts
{
  provide: CACHE_SERVICE,
  useFactory: () =>
    CACHE_DRIVER === 'redis' ? new RedisCacheService() : new InMemoryCacheService(),
}
```

`CacheModule` se importa en `AppModule` y en cualquier módulo que lo necesite.

---

## 3. TimezoneService

Servicio dentro de `RestaurantsModule` que resuelve el timezone de un restaurante con cache.

```ts
// Clave de cache: 'timezone:{restaurantId}'
async getTimezone(restaurantId: string): Promise<string>
async invalidate(restaurantId: string): Promise<void>
```

- Primera llamada: query a `RestaurantSettings` donde `restaurantId = ?`
- Llamadas posteriores: retorna del cache (`CACHE_SERVICE`)
- Si settings es null: lanza `InternalServerErrorException`

---

## 4. Impacto en servicios backend

Todos los servicios dejan de usar el `TIMEZONE` global. En su lugar reciben el timezone a través del restaurante ya cargado o vía `TimezoneService`.

| Servicio | Cambio |
|---|---|
| `KioskService.getCurrentDayAndTime()` | Recibe `timezone` como parámetro en lugar de importar `TIMEZONE` global |
| `OrdersService` | Interpreta `dateFrom`/`dateTo` en el timezone del restaurante al filtrar órdenes |
| `PrintService` | Formatea timestamps de tickets con el timezone del restaurante |
| `CashShiftService` | `closedAt` sigue en UTC; display usa timezone del restaurante |

La constante `TIMEZONE` en `config.ts` se elimina. La variable `TZ` del env var se vuelve opcional (o se elimina del `.env` requerido).

---

## 5. Respuestas de la API

El campo `timezone` se incluye en todas las respuestas que devuelven datos de restaurante o settings:

- `GET /v1/restaurants/:id` (y cualquier endpoint que retorne el restaurante)
- Respuesta de login/me si incluye datos del restaurante
- Endpoints de settings

---

## 6. Frontend

### Acceso al timezone

El frontend obtiene el timezone del restaurante desde la respuesta de la API al cargar la sesión. Se almacena en memoria/contexto de la app durante la sesión.

### Formateo de fechas

Toda fecha que se muestre en el dashboard o kiosk usa `Intl.DateTimeFormat` con el timezone del restaurante:

```ts
function formatDate(isoString: string, timezone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es', { timeZone: timezone, ...options }).format(new Date(isoString));
}
```

Aplica a: timestamps de órdenes, apertura/cierre de turno de caja, fechas en reportes, tickets del kiosk.

---

## 7. CLI

```bash
pnpm run cli create-restaurant --name "Mi Restaurante" --timezone "America/Mexico_City"
```

- `--timezone` es opcional, default `"UTC"`
- Validación con `Intl.DateTimeFormat(undefined, { timeZone: value })` — lanza `RangeError` si es inválido
- El comando llama a `RestaurantsService.createRestaurant(name, timezone)` que crea Restaurant + RestaurantSettings en una transacción
- `create-dummy` actualizado: acepta env var `DUMMY_TIMEZONE` con default `"UTC"`

---

## Timezones IANA de referencia

| País | Timezone |
|---|---|
| México (Centro) | `America/Mexico_City` |
| México (Pacífico) | `America/Mazatlan` |
| Argentina | `America/Argentina/Buenos_Aires` |
| Chile | `America/Santiago` |
| Colombia | `America/Bogota` |
| Canadá (Este) | `America/Toronto` |
| Canadá (Pacífico) | `America/Vancouver` |
| UTC | `UTC` |
