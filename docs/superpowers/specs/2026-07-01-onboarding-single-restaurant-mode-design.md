# Onboarding single-restaurant mode — Design

**Fecha:** 2026-07-01
**Estado:** Aprobado (pendiente review del spec)

## Problema

En una instalación **self-host**, cada instancia corresponde a **un solo restaurante**. Hoy el
endpoint público `POST /v1/onboarding/register` permite registrar restaurantes ilimitados. Una vez
que el dueño registró el suyo, no debería poder crearse ninguno más por la vía pública: los
restaurantes adicionales (caso raro) se crean solo por CLI.

En el **cloud SaaS** (Railway) el onboarding multi-restaurante debe seguir **abierto**. Por eso el
bloqueo es **opt-in por configuración**, no universal.

## Objetivo

Cuando un flag de config está activo y ya existe ≥1 restaurante, bloquear el registro público de
onboarding y redirigir la UI a `/login`. El primer registro por web sigue permitido; los siguientes
solo por CLI. Sin flag (default/cloud), nada cambia.

## No-objetivos

- No se toca el flujo de creación de restaurantes por CLI (`create-restaurant`) — ya existe y crea
  directo, sin pasar por el endpoint, así que **siempre** funciona.
- No se limita la cantidad a nivel base de datos (no es un límite de licencia; es un cierre de la
  vía pública). El CLI puede crear más si hace falta.
- No se cambia el modelo multi-tenant ni el scoping por `restaurantId`.

## Decisiones

- **Nombre del flag:** `SINGLE_RESTAURANT_MODE` (bool, default `false`).
- **Code de error:** `ONBOARDING_CLOSED` (HTTP **403**).
- **Enforcement:** un **guard** dedicado (no chequeo inline en el service), porque corre antes de
  parsear el upload, mantiene el controller declarativo como el resto (`@Public`, `ThrottlerGuard`)
  y se testea aislado.

## Arquitectura

### 1. Config flag (`apps/api-core/src/config.ts`)

Nueva constante, leída **solo** acá (convención de env centralizada):

```ts
export const SINGLE_RESTAURANT_MODE =
  (process.env.SINGLE_RESTAURANT_MODE ?? 'false').toLowerCase() === 'true';
```

Se agrega a la interfaz/validación de config existente como opcional.

### 2. `RestaurantsService.count()`

Método nuevo:

```ts
count(): Promise<number> {
  return this.prisma.restaurant.count();
}
```

### 3. Guard `OnboardingOpenGuard` (`apps/api-core/src/onboarding/guards/`)

- Inyecta `RestaurantsService`.
- `canActivate`: si `SINGLE_RESTAURANT_MODE === false` → permite. Si `true` y `count() >= 1` →
  lanza `OnboardingClosedException`. Si `true` y `count() === 0` → permite (1er registro).
- Se aplica a `@Post('register')` junto al `ThrottlerGuard` existente.

### 4. Excepción `OnboardingClosedException`

En `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts`, siguiendo ADR 0007:
- HTTP 403, code `ONBOARDING_CLOSED`, message técnico en inglés
  (`"Onboarding registration is closed on this instance"`).
- Comentario en la definición + `@ApiResponse({ status: 403, ... })` en el controller.

### 5. Endpoint de estado `GET /v1/onboarding/status`

- `@Public()`, sin rate limit especial.
- Respuesta: `{ registrationOpen: boolean }` donde
  `registrationOpen = !(SINGLE_RESTAURANT_MODE && count >= 1)`.
- Serializer `OnboardingStatusSerializer`.

### 6. Frontend

- La página `apps/ui/src/pages/onboarding.astro` es `prerender = true` (HTML estático) y monta
  `<OnboardingWizard client:load />`. Por eso el redirect va en el **componente React**
  `apps/ui/src/components/onboarding/OnboardingWizard.tsx`: en un `useEffect` al montar, `fetch`
  a `/v1/onboarding/status` vía el wrapper público existente; si `registrationOpen === false` →
  `window.location.replace('/login')` (idealmente mostrando un estado de carga hasta resolver,
  para no flashear el wizard).
- `apps/ui/src/lib/error-messages.ts`: entrada friendly ES para `ONBOARDING_CLOSED` (fallback si
  alguien llega igual al submit).

## Documentación (requisito explícito)

- **`apps/api-core/docs/environments.md`**: nueva subsección **"ONBOARDING / REGISTRO"** con
  `SINGLE_RESTAURANT_MODE` (default `false`, required `false`, nota: en self-host va `true`).
- **`apps/api-core/src/onboarding/onboarding.module.info.md`**: documentar el guard, el nuevo
  endpoint `GET /status`, y el error `ONBOARDING_CLOSED`; actualizar la tabla de endpoints.
- **`docs/self-hosting.md`** (§5 "Primer uso"): explicar el flujo — 1er registro por web permitido
  → bloqueo tras el 1º → alta de restaurantes adicionales solo por CLI (`pnpm run cli
  create-restaurant`) → la UI redirige a `/login` cuando ya está configurado.
- **`deploy/.env.example`** y **`deploy/docker-compose.yml`**: agregar `SINGLE_RESTAURANT_MODE=true`
  (default self-host) y pasarlo al servicio `res-api-core`.

## Flujos

**Self-host, instancia nueva (0 restaurantes):**
1. Dueño abre `/onboarding` → `status` devuelve `registrationOpen: true` → wizard visible.
2. Completa el registro → 201, se crea el restaurante.

**Self-host, instancia ya configurada (≥1 restaurante):**
1. Alguien abre `/onboarding` → `status` devuelve `registrationOpen: false` → redirect a `/login`.
2. Si igual llega a `POST /register` (curl, etc.) → `OnboardingOpenGuard` → 403 `ONBOARDING_CLOSED`.
3. Para sumar otro restaurante (excepcional): `pnpm run cli create-restaurant --name ...` (bypass).

**Cloud SaaS (flag off):** sin cambios; `registrationOpen` siempre `true`, onboarding abierto.

## Testing

- **Guard** (unit): permite con flag off (cualquier count); permite con flag on + count 0; bloquea
  con flag on + count ≥ 1 (lanza `OnboardingClosedException`).
- **Status endpoint** (unit/controller): `registrationOpen` correcto según flag y count.
- **error-messages** (UI): existe el mapeo friendly de `ONBOARDING_CLOSED`.
- Los tests deben correr **dentro del contenedor** (`docker compose exec res-api-core pnpm test`).

## Archivos

**Nuevos:**
- `apps/api-core/src/onboarding/guards/onboarding-open.guard.ts` (+ spec)
- `apps/api-core/src/onboarding/serializers/onboarding-status.serializer.ts`

**Modificados:**
- `apps/api-core/src/config.ts` — flag
- `apps/api-core/src/restaurants/restaurants.service.ts` — `count()`
- `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts` — excepción
- `apps/api-core/src/onboarding/onboarding.controller.ts` — guard + `GET /status` + `@ApiResponse`
- `apps/ui/src/components/onboarding/OnboardingWizard.tsx` — redirect a `/login` si cerrado
- `apps/ui/src/lib/error-messages.ts` — mensaje friendly
- Docs: `apps/api-core/docs/environments.md`, `onboarding.module.info.md`, `docs/self-hosting.md`,
  `deploy/.env.example`, `deploy/docker-compose.yml`
