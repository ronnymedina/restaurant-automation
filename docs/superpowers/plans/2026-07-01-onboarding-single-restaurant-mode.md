# Onboarding single-restaurant mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En modo self-host (flag `SINGLE_RESTAURANT_MODE`), cerrar el registro público de onboarding una vez que existe ≥1 restaurante; en cloud (flag off) nada cambia.

**Architecture:** Un flag de config `SINGLE_RESTAURANT_MODE`, una función pura `registrationOpen(flag, count)` reutilizada por un guard (`OnboardingOpenGuard` sobre `POST /register`) y por un endpoint público `GET /onboarding/status` que consume la UI para redirigir a `/login`. La creación por CLI (`create-restaurant`) no pasa por el endpoint y queda intacta.

**Tech Stack:** NestJS (guards, class-validator config, ADR 0007 error contract), Prisma, Astro + React (Vitest), pnpm. Tests siempre dentro del contenedor Docker.

Spec: `docs/superpowers/specs/2026-07-01-onboarding-single-restaurant-mode-design.md`.

---

## Convenciones de ejecución

- Trabajar desde la raíz del repo: `/Users/ronny/projects/restaurants`. Backend en `apps/api-core/`.
- Rama actual: `feat/onboarding-v2-pais-separador-errores`. Quedarse en ella.
- Tests del backend **dentro del contenedor**: `docker compose exec -T res-api-core pnpm test`.
  Levantar antes si hace falta: `docker compose up -d res-db res-api-core`.
- Tests de UI: `docker compose exec -T res-ui node_modules/.bin/vitest run <archivo>` (el contenedor
  `res-ui` no tiene `pnpm` en `exec`; hay ~13 fallas UI preexistentes ajenas a esta tarea).
- Hay un cambio ajeno sin commitear en `apps/ui/src/components/dash/orders/OrdersPanel.tsx`: NO
  incluirlo en ningún commit (usar `git add` con rutas explícitas).
- Un commit por tarea.

---

## File Structure

**Nuevos (backend):**
- `apps/api-core/src/onboarding/onboarding-registration.ts` — función pura `registrationOpen()`.
- `apps/api-core/src/onboarding/onboarding-registration.spec.ts` — tabla de verdad del helper.
- `apps/api-core/src/onboarding/guards/onboarding-open.guard.ts` — guard.
- `apps/api-core/src/onboarding/guards/onboarding-open.guard.spec.ts` — test del guard.
- `apps/api-core/src/onboarding/serializers/onboarding-status.serializer.ts` — DTO de respuesta.

**Modificados (backend):**
- `apps/api-core/src/config.ts` — flag `SINGLE_RESTAURANT_MODE`.
- `apps/api-core/src/restaurants/restaurant.repository.ts` — `count()`.
- `apps/api-core/src/restaurants/restaurants.service.ts` — `count()`.
- `apps/api-core/src/restaurants/restaurants.service.spec.ts` — test de `count()` (crear si no existe).
- `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts` — `OnboardingClosedException`.
- `apps/api-core/src/onboarding/onboarding.controller.ts` — guard + `GET /status` + `@ApiResponse`.
- `apps/api-core/src/onboarding/onboarding.controller.spec.ts` — test del status endpoint.
- `apps/api-core/src/onboarding/onboarding.module.ts` — proveer el guard.

**Modificados (frontend):**
- `apps/ui/src/lib/error-messages.ts` — mensaje friendly `ONBOARDING_CLOSED`.
- `apps/ui/src/components/onboarding/OnboardingWizard.tsx` — gate + redirect a `/login`.

**Docs / deploy:**
- `apps/api-core/docs/environments.md`, `apps/api-core/src/onboarding/onboarding.module.info.md`,
  `docs/self-hosting.md`, `deploy/.env.example`, `deploy/docker-compose.yml`.

---

## Task 1: Flag de config `SINGLE_RESTAURANT_MODE`

**Files:**
- Modify: `apps/api-core/src/config.ts`

- [ ] **Step 1: Declarar el campo en la clase de validación**

En `apps/api-core/src/config.ts`, en la clase `EnvironmentVariables`, junto al resto de flags
string opcionales (por ejemplo cerca de `COOKIE_SECURE?: string;`), agregar:

```ts
  @IsOptional()
  @IsString()
  SINGLE_RESTAURANT_MODE?: string;
```

- [ ] **Step 2: Exportar la constante tipada**

En la zona de exports de `config.ts` (junto a `COOKIE_SECURE`, mismo patrón de parseo), agregar:

```ts
export const SINGLE_RESTAURANT_MODE =
  (process.env.SINGLE_RESTAURANT_MODE ?? 'false').toLowerCase() === 'true';
```

- [ ] **Step 3: Verificar que compila y el default es false**

Run: `docker compose up -d res-db res-api-core && docker compose exec -T res-api-core node -e "console.log(require('./dist/src/config').SINGLE_RESTAURANT_MODE)"` 
Si `dist` no existe en el contenedor dev, verificar por typecheck: `docker compose exec -T res-api-core pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5`
Expected: imprime `false` (o typecheck sin errores nuevos relacionados a `SINGLE_RESTAURANT_MODE`).

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/config.ts
git commit -m "feat(config): flag SINGLE_RESTAURANT_MODE (default false)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Función pura `registrationOpen()`

**Files:**
- Create: `apps/api-core/src/onboarding/onboarding-registration.ts`
- Create: `apps/api-core/src/onboarding/onboarding-registration.spec.ts`

- [ ] **Step 1: Escribir el test (tabla de verdad)**

Crear `apps/api-core/src/onboarding/onboarding-registration.spec.ts`:

```ts
import { registrationOpen } from './onboarding-registration';

describe('registrationOpen', () => {
  it('abierto cuando el flag está apagado, sin importar el count', () => {
    expect(registrationOpen(false, 0)).toBe(true);
    expect(registrationOpen(false, 1)).toBe(true);
    expect(registrationOpen(false, 5)).toBe(true);
  });

  it('abierto con flag encendido y 0 restaurantes (permite el primer registro)', () => {
    expect(registrationOpen(true, 0)).toBe(true);
  });

  it('cerrado con flag encendido y ya existe ≥1 restaurante', () => {
    expect(registrationOpen(true, 1)).toBe(false);
    expect(registrationOpen(true, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec -T res-api-core pnpm test -- onboarding-registration`
Expected: FAIL — `Cannot find module './onboarding-registration'`.

- [ ] **Step 3: Implementar el helper**

Crear `apps/api-core/src/onboarding/onboarding-registration.ts`:

```ts
/**
 * Determina si el registro público de onboarding está abierto.
 * En modo single-restaurant, se cierra una vez que existe al menos un restaurante;
 * el primer registro (count 0) sigue permitido. Con el flag apagado, siempre abierto.
 */
export function registrationOpen(singleRestaurantMode: boolean, restaurantCount: number): boolean {
  return !(singleRestaurantMode && restaurantCount >= 1);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec -T res-api-core pnpm test -- onboarding-registration`
Expected: PASS (3 tests verdes).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding-registration.ts apps/api-core/src/onboarding/onboarding-registration.spec.ts
git commit -m "feat(onboarding): helper puro registrationOpen(flag, count)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `count()` de restaurantes (repository + service)

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurant.repository.ts`
- Modify: `apps/api-core/src/restaurants/restaurants.service.ts`
- Modify/Create: `apps/api-core/src/restaurants/restaurants.service.spec.ts`

- [ ] **Step 1: Escribir el test del service**

En `apps/api-core/src/restaurants/restaurants.service.spec.ts` (si no existe, crearlo con este
contenido; si existe, agregar el `describe` dentro del archivo respetando su setup):

```ts
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { TimezoneService } from './timezone.service';

describe('RestaurantsService.count', () => {
  it('delega en el repositorio y devuelve el número', async () => {
    const repo = { count: jest.fn().mockResolvedValue(2) } as unknown as RestaurantRepository;
    const service = new RestaurantsService(repo, {} as TimezoneService);

    await expect(service.count()).resolves.toBe(2);
    expect(repo.count).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec -T res-api-core pnpm test -- restaurants.service`
Expected: FAIL — `service.count is not a function` (o `repo.count` no existe).

- [ ] **Step 3: Agregar `count()` al repositorio**

En `apps/api-core/src/restaurants/restaurant.repository.ts`, dentro de la clase
`RestaurantRepository`, agregar el método:

```ts
  count(): Promise<number> {
    return this.prisma.restaurant.count();
  }
```

- [ ] **Step 4: Agregar `count()` al service**

En `apps/api-core/src/restaurants/restaurants.service.ts`, dentro de la clase
`RestaurantsService`, agregar:

```ts
  /** Total de restaurantes. Usado por el modo single-restaurant del onboarding. */
  count(): Promise<number> {
    return this.restaurantRepository.count();
  }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `docker compose exec -T res-api-core pnpm test -- restaurants.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/restaurants/restaurant.repository.ts apps/api-core/src/restaurants/restaurants.service.ts apps/api-core/src/restaurants/restaurants.service.spec.ts
git commit -m "feat(restaurants): RestaurantsService.count() (repo + service)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Excepción `OnboardingClosedException`

**Files:**
- Modify: `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts`

- [ ] **Step 1: Agregar la excepción**

Al final de `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts`, agregar:

```ts
/**
 * Thrown when public onboarding registration is closed on this instance
 * (single-restaurant mode with a restaurant already registered).
 * code: `ONBOARDING_CLOSED` · HTTP 403. Ver docs/onboarding-error-mapping.md.
 */
export class OnboardingClosedException extends BaseException {
  constructor() {
    super(
      'Onboarding registration is closed on this instance',
      HttpStatus.FORBIDDEN,
      'ONBOARDING_CLOSED',
    );
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `docker compose exec -T res-api-core pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts
git commit -m "feat(onboarding): OnboardingClosedException (403 ONBOARDING_CLOSED)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Guard `OnboardingOpenGuard`

**Files:**
- Create: `apps/api-core/src/onboarding/guards/onboarding-open.guard.ts`
- Create: `apps/api-core/src/onboarding/guards/onboarding-open.guard.spec.ts`

- [ ] **Step 1: Escribir el test del guard**

Crear `apps/api-core/src/onboarding/guards/onboarding-open.guard.spec.ts`. Se mockea el módulo de
config para encender el flag; el count se controla con el mock del service.

```ts
jest.mock('../../config', () => ({ SINGLE_RESTAURANT_MODE: true }));

import { OnboardingOpenGuard } from './onboarding-open.guard';
import { OnboardingClosedException } from '../exceptions/onboarding.exceptions';
// import type: solo lo usamos como tipo. Evita cargar el módulo real de RestaurantsService
// (y sus dependencias) bajo el jest.mock de '../../config'.
import type { RestaurantsService } from '../../restaurants/restaurants.service';

function makeGuard(count: number) {
  const service = { count: jest.fn().mockResolvedValue(count) } as unknown as RestaurantsService;
  return { guard: new OnboardingOpenGuard(service), service };
}

describe('OnboardingOpenGuard (SINGLE_RESTAURANT_MODE=true)', () => {
  it('permite el primer registro (count 0)', async () => {
    const { guard } = makeGuard(0);
    await expect(guard.canActivate({} as never)).resolves.toBe(true);
  });

  it('bloquea cuando ya existe un restaurante (count ≥ 1)', async () => {
    const { guard } = makeGuard(1);
    await expect(guard.canActivate({} as never)).rejects.toBeInstanceOf(OnboardingClosedException);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec -T res-api-core pnpm test -- onboarding-open.guard`
Expected: FAIL — `Cannot find module './onboarding-open.guard'`.

- [ ] **Step 3: Implementar el guard**

Crear `apps/api-core/src/onboarding/guards/onboarding-open.guard.ts`:

```ts
import { CanActivate, Injectable } from '@nestjs/common';
import { RestaurantsService } from '../../restaurants/restaurants.service';
import { SINGLE_RESTAURANT_MODE } from '../../config';
import { registrationOpen } from '../onboarding-registration';
import { OnboardingClosedException } from '../exceptions/onboarding.exceptions';

/**
 * Bloquea POST /onboarding/register cuando el registro público está cerrado
 * (modo single-restaurant con un restaurante ya registrado). Corre antes de
 * parsear el upload, así que el rechazo es barato.
 */
@Injectable()
export class OnboardingOpenGuard implements CanActivate {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  async canActivate(): Promise<boolean> {
    const count = await this.restaurantsService.count();
    if (!registrationOpen(SINGLE_RESTAURANT_MODE, count)) {
      throw new OnboardingClosedException();
    }
    return true;
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec -T res-api-core pnpm test -- onboarding-open.guard`
Expected: PASS (2 tests verdes).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/onboarding/guards/onboarding-open.guard.ts apps/api-core/src/onboarding/guards/onboarding-open.guard.spec.ts
git commit -m "feat(onboarding): OnboardingOpenGuard cierra el registro público

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wiring en el controller (`GET /status` + guard en register)

**Files:**
- Create: `apps/api-core/src/onboarding/serializers/onboarding-status.serializer.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.controller.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.controller.spec.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.module.ts`

- [ ] **Step 1: Crear el serializer de estado**

Crear `apps/api-core/src/onboarding/serializers/onboarding-status.serializer.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class OnboardingStatusSerializer {
  @ApiProperty({ description: 'true si el registro público de onboarding está disponible' })
  registrationOpen!: boolean;
}
```

- [ ] **Step 2: Escribir el test del status endpoint**

En `apps/api-core/src/onboarding/onboarding.controller.spec.ts`, agregar al final del archivo un
nuevo `describe`. El controller ahora recibe `RestaurantsService` como 2º argumento.

```ts
import { RestaurantsService } from '../restaurants/restaurants.service';
import { OnboardingController as _OC } from './onboarding.controller';
import { OnboardingService as _OS } from './onboarding.service';

describe('OnboardingController.getStatus', () => {
  it('registrationOpen=true cuando no hay restaurantes', async () => {
    const restaurants = { count: jest.fn().mockResolvedValue(0) } as unknown as RestaurantsService;
    const controller = new _OC({} as _OS, restaurants);
    await expect(controller.getStatus()).resolves.toEqual({ registrationOpen: true });
  });
});
```

> Nota: como `SINGLE_RESTAURANT_MODE` es `false` por default en el entorno de test, `getStatus`
> devuelve `registrationOpen: true` sin importar el count. Este test valida el wiring del endpoint
> (que llama a `count()` y arma la respuesta). La lógica del flag ya está cubierta en Task 2.
> Además, actualizar el `beforeEach` del `describe` existente `getCountries` para pasar el 2º
> argumento: `controller = new OnboardingController({} as OnboardingService, {} as RestaurantsService);`

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `docker compose exec -T res-api-core pnpm test -- onboarding.controller`
Expected: FAIL — `controller.getStatus is not a function` y/o error de aridad del constructor.

- [ ] **Step 4: Modificar el controller**

En `apps/api-core/src/onboarding/onboarding.controller.ts`:

a) Agregar imports:

```ts
import { UseGuards } from '@nestjs/common'; // añadir a la lista existente si falta
import { RestaurantsService } from '../restaurants/restaurants.service';
import { SINGLE_RESTAURANT_MODE } from '../config';
import { registrationOpen } from './onboarding-registration';
import { OnboardingOpenGuard } from './guards/onboarding-open.guard';
import { OnboardingStatusSerializer } from './serializers/onboarding-status.serializer';
```

b) Inyectar `RestaurantsService` en el constructor:

```ts
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly restaurantsService: RestaurantsService,
  ) {}
```

c) Agregar el endpoint de estado (junto a `getCountries`):

```ts
  @Public()
  @Get('status')
  @ApiOperation({
    summary: 'Estado del registro de onboarding',
    description: 'Indica si el registro público está disponible. En modo single-restaurant se cierra tras el primer restaurante.',
  })
  @ApiResponse({ status: 200, description: 'Estado del registro', type: OnboardingStatusSerializer })
  async getStatus(): Promise<OnboardingStatusSerializer> {
    const count = await this.restaurantsService.count();
    return { registrationOpen: registrationOpen(SINGLE_RESTAURANT_MODE, count) };
  }
```

d) Aplicar el guard al endpoint `register` (agregar `OnboardingOpenGuard` a `@UseGuards`) y
documentar el 403. La línea existente `@UseGuards(ThrottlerGuard)` pasa a:

```ts
  @UseGuards(ThrottlerGuard, OnboardingOpenGuard)
```

y agregar, junto a los otros `@ApiResponse` del `register`:

```ts
  @ApiResponse({
    status: 403,
    description: 'Registro cerrado en esta instancia (modo single-restaurant con restaurante ya registrado)',
    schema: { example: { message: ['Onboarding registration is closed on this instance'], code: 'ONBOARDING_CLOSED', statusCode: 403 } },
  })
```

- [ ] **Step 5: Proveer el guard en el módulo**

En `apps/api-core/src/onboarding/onboarding.module.ts`, agregar `OnboardingOpenGuard` al array
`providers` (import arriba). `RestaurantsModule` ya está importado y exporta `RestaurantsService`,
así que no hacen falta más cambios de wiring.

```ts
import { OnboardingOpenGuard } from './guards/onboarding-open.guard';
// ...
  providers: [OnboardingService, OnboardingOpenGuard],
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `docker compose exec -T res-api-core pnpm test -- onboarding.controller`
Expected: PASS (incluye `getCountries` y el nuevo `getStatus`).

- [ ] **Step 7: Verificar el arranque de la app (DI del guard/controller)**

Run: `docker compose restart res-api-core && sleep 6 && docker compose logs res-api-core | grep -iE "successfully started|Mapped .*onboarding/status"`
Expected: `Nest application successfully started` y la ruta `{/onboarding/status, GET}` mapeada.

- [ ] **Step 8: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.controller.ts apps/api-core/src/onboarding/onboarding.controller.spec.ts apps/api-core/src/onboarding/onboarding.module.ts apps/api-core/src/onboarding/serializers/onboarding-status.serializer.ts
git commit -m "feat(onboarding): GET /status + guard OnboardingOpenGuard en register

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Verificación e2e del bloqueo (manual, con flag on)

**Files:** ninguno (verificación). No marcar completo si algún paso falla.

- [ ] **Step 1: Levantar api-core con el flag encendido**

Run:
```bash
docker compose up -d res-db
cd apps/api-core && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/restaurants" \
  JWT_SECRET="local-dev-secret-at-least-32-chars-long-aaaa" JWT_ACCESS_EXPIRATION=15m \
  JWT_REFRESH_EXPIRATION=7d BCRYPT_SALT_ROUNDS=10 CACHE_DRIVER=memory NODE_ENV=production \
  SINGLE_RESTAURANT_MODE=true PORT=3011 pnpm run build && \
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/restaurants" \
  JWT_SECRET="local-dev-secret-at-least-32-chars-long-aaaa" JWT_ACCESS_EXPIRATION=15m \
  JWT_REFRESH_EXPIRATION=7d BCRYPT_SALT_ROUNDS=10 CACHE_DRIVER=memory NODE_ENV=production \
  SINGLE_RESTAURANT_MODE=true PORT=3011 node dist/src/main &
sleep 8
```
Expected: la app arranca. (Si ya hay datos de dev, puede haber restaurantes; el paso 2 lo tiene en
cuenta.)

- [ ] **Step 2: Verificar `GET /status` y el bloqueo de `register`**

Run:
```bash
echo "status:" && curl -s -H "Origin: http://localhost:4321" http://localhost:3011/v1/onboarding/status; echo
echo "register:" && curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3011/v1/onboarding/register \
  -H "Origin: http://localhost:4321" -F email=blocked@test.com -F restaurantName=Blocked -F country=CL -F timezone=America/Santiago
kill %1 2>/dev/null || true
```
Expected:
- Si la DB de dev ya tiene ≥1 restaurante: `status` → `{"registrationOpen":false}` y `register` → **403**.
- Si la DB está vacía: `status` → `{"registrationOpen":true}` y `register` → **201** (primer registro);
  volver a correr el `register` debe dar **403** en el segundo intento.

En cualquier caso, confirmá que **con ≥1 restaurante el register devuelve 403** (repetir el curl si
hizo falta crear el primero).

- [ ] **Step 3: Limpiar**

Run: `cd apps/api-core && rm -rf dist`
(Artefacto de build local; no se commitea.)

---

## Task 8: Frontend — redirect y mensaje de error

**Files:**
- Modify: `apps/ui/src/lib/error-messages.ts`
- Modify: `apps/ui/src/components/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Agregar el mensaje friendly**

En `apps/ui/src/lib/error-messages.ts`, dentro del objeto `errorMessages`, agregar la entrada:

```ts
  ONBOARDING_CLOSED: 'El registro ya no está disponible en esta instalación.',
```

- [ ] **Step 2: Escribir el test del redirect (Vitest)**

Crear `apps/ui/src/components/onboarding/OnboardingWizard.gate.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OnboardingWizard from './OnboardingWizard';

describe('OnboardingWizard registration gate', () => {
  beforeEach(() => {
    // window.location.replace no existe en jsdom por defecto; lo stubbeamos.
    Object.defineProperty(window, 'location', {
      value: { replace: vi.fn(), href: '' },
      writable: true,
    });
  });

  it('redirige a /login cuando registrationOpen=false', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/v1/onboarding/status')) {
        return { ok: true, json: async () => ({ registrationOpen: false }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }));

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith('/login');
    });
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `docker compose up -d res-ui && docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/OnboardingWizard.gate.test.tsx`
Expected: FAIL — `window.location.replace` no fue llamado (el gate aún no existe).

- [ ] **Step 4: Implementar el gate en el wizard**

En `apps/ui/src/components/onboarding/OnboardingWizard.tsx`:

a) Asegurar el import de hooks de React (el archivo ya usa `useState`; agregar `useEffect`):

```ts
import { useEffect, useState } from 'react';
```

b) Dentro del componente `OnboardingWizard` (el componente principal exportado por default), al
inicio del cuerpo, agregar un estado de chequeo y el efecto que consulta el estado del registro:

```ts
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/v1/onboarding/status`);
        const data = (await res.json()) as { registrationOpen?: boolean };
        if (!cancelled && data.registrationOpen === false) {
          window.location.replace('/login');
          return;
        }
      } catch {
        // Si el chequeo falla, dejamos ver el wizard (no bloqueamos por un error de red).
      }
      if (!cancelled) setCheckingAccess(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
```

c) Antes del `return` principal del wizard, cortar el render mientras se verifica el acceso, para
no mostrar el formulario y luego redirigir:

```ts
  if (checkingAccess) {
    return (
      <div className="min-h-[300px] flex items-center justify-center text-slate-500">
        Cargando…
      </div>
    );
  }
```

> Ubicación: si el componente `OnboardingWizard` tiene el bloque `return (` con el JSX del wizard,
> insertar el `if (checkingAccess)` inmediatamente antes de ese `return`. El estado/efecto van al
> tope del cuerpo del componente, junto a los demás `useState`.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/OnboardingWizard.gate.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verificar que no rompimos los tests existentes del wizard**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: los tests existentes que ya pasaban siguen verdes. Si alguno depende del render inmediato
del Step 1, ajustá el mock para que `fetch('/v1/onboarding/status')` devuelva
`{ registrationOpen: true }` (permitiendo que el wizard se muestre). Documentar cualquier ajuste.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/lib/error-messages.ts apps/ui/src/components/onboarding/OnboardingWizard.tsx apps/ui/src/components/onboarding/OnboardingWizard.gate.test.tsx
git commit -m "feat(ui/onboarding): redirect a /login cuando el registro está cerrado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Documentación y deploy

**Files:**
- Modify: `apps/api-core/docs/environments.md`
- Modify: `apps/api-core/src/onboarding/onboarding.module.info.md`
- Modify: `docs/self-hosting.md`
- Modify: `deploy/.env.example`
- Modify: `deploy/docker-compose.yml`

- [ ] **Step 1: Documentar la variable en `environments.md`**

En `apps/api-core/docs/environments.md`, agregar una nueva sección (por ejemplo antes de `### AI /
ONBOARDING`):

```markdown
---

### ONBOARDING / REGISTRO

* **SINGLE_RESTAURANT_MODE**: Cierra el registro público de onboarding una vez que existe un
  restaurante (instancias de un solo restaurante, típico de self-host). El primer registro por web
  sigue permitido; los siguientes solo por CLI (`pnpm run cli create-restaurant`). La UI de
  `/onboarding` redirige a `/login` cuando el registro está cerrado.
  - Default: `false`
  - Required: `false`
  - Valores: `true`, `false`
  - **Self-host**: `true`. **Cloud SaaS**: `false` (onboarding multi-restaurante abierto).
```

- [ ] **Step 2: Documentar el flujo en el módulo onboarding**

En `apps/api-core/src/onboarding/onboarding.module.info.md`:

a) En la tabla de **Endpoints**, agregar la fila:

```markdown
| `GET` | `/v1/onboarding/status` | Público | `OnboardingStatus` | `{ registrationOpen }` — si el registro público está disponible |
```

b) Al final del documento, agregar una sección:

```markdown
### Modo single-restaurant (`SINGLE_RESTAURANT_MODE`)

Cuando `SINGLE_RESTAURANT_MODE=true`, `OnboardingOpenGuard` bloquea `POST /register` si ya existe
≥1 restaurante, devolviendo **403 `ONBOARDING_CLOSED`**. El primer registro (0 restaurantes) sigue
permitido. `GET /status` expone `{ registrationOpen }` para que la UI redirija a `/login` cuando el
registro está cerrado. Los restaurantes adicionales se crean por CLI (`create-restaurant`), que no
pasa por el endpoint. Con el flag apagado (cloud), el registro está siempre abierto.
```

- [ ] **Step 3: Documentar el flujo en la guía self-host**

En `docs/self-hosting.md`, en la sección **§5 "Primer uso (onboarding)"**, agregar al final:

```markdown
> **Un solo restaurante por instancia.** Con `SINGLE_RESTAURANT_MODE=true` (default de la plantilla
> self-host), una vez que registrás tu restaurante el formulario de `/onboarding` deja de estar
> disponible: la página redirige a `/login`. Si en algún caso excepcional necesitás crear otro
> restaurante en la misma instancia, hacelo por línea de comando:
>
> ```bash
> docker compose exec res-api-core pnpm run cli create-restaurant --name "Otro Local"
> ```
```

- [ ] **Step 4: Agregar la variable al deploy**

a) En `deploy/.env.example`, agregar (en una sección coherente, p. ej. junto a las de la app):

```
# Un solo restaurante por instancia: cierra el registro web tras el primero.
SINGLE_RESTAURANT_MODE=true
```

b) En `deploy/docker-compose.yml`, en el bloque `environment:` del servicio `res-api-core`, agregar:

```yaml
      SINGLE_RESTAURANT_MODE: ${SINGLE_RESTAURANT_MODE:-true}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/docs/environments.md apps/api-core/src/onboarding/onboarding.module.info.md docs/self-hosting.md deploy/.env.example deploy/docker-compose.yml
git commit -m "docs: documentar SINGLE_RESTAURANT_MODE y el flujo de registro single-restaurant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Regresión final

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite completa de api-core**

Run: `docker compose exec -T res-api-core pnpm test 2>&1 | tail -15`
Expected: suite verde (los nuevos tests incluidos; sin regresiones).

- [ ] **Step 2: Confirmar el working tree**

Run: `git status --short`
Expected: solo aparece `apps/ui/src/components/dash/orders/OrdersPanel.tsx` (cambio ajeno preexistente).

---

## Self-Review (cobertura del spec)

- **Flag `SINGLE_RESTAURANT_MODE` (default false), env centralizado** → Task 1.
- **Helper puro `registrationOpen`** → Task 2.
- **`RestaurantsService.count()`** → Task 3.
- **`OnboardingClosedException` (403, ADR 0007)** → Task 4.
- **`OnboardingOpenGuard` en `POST /register`** → Task 5 (guard) + Task 6 (wiring).
- **`GET /onboarding/status` → `{ registrationOpen }`** → Task 6.
- **CLI intacto (bypass)** → no requiere cambios; verificado en doc (Task 9) y por diseño.
- **Frontend redirect + mensaje friendly** → Task 8.
- **Docs: environments.md, module.info, self-hosting, deploy** → Task 9.
- **Verificación real del bloqueo (403 con ≥1 restaurante)** → Task 7; regresión → Task 10.
