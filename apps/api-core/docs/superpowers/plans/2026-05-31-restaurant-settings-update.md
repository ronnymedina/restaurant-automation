# Restaurant Settings Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar la edición de los datos del restaurante (`name`, `timezone`, `currency`, `decimalSeparator`) en un único endpoint ADMIN-only, eliminando el legacy `PATCH /name` y dejando `country`/`slug` como read-only.

**Architecture:** NestJS REST + Prisma. Un nuevo `PATCH /v1/restaurants/settings` valida shape vía `class-validator`, regla `timezone ∈ country.timezones` en el service (lookup con `countries-and-timezones`), deriva `thousandsSeparator` desde `decimalSeparator`, y persiste `Restaurant` + `RestaurantSettings` en una transacción Prisma. `restaurantId` siempre del JWT.

**Tech Stack:** NestJS, Prisma (PostgreSQL), `class-validator`, `countries-and-timezones`, `currency-codes`, Jest (Docker), Astro (UI).

**Spec:** [`docs/superpowers/specs/2026-05-31-restaurant-settings-update-design.md`](../specs/2026-05-31-restaurant-settings-update-design.md)

**Convención importante (de memoria del proyecto):**
- Todos los tests corren **dentro del contenedor Docker**: `docker compose exec res-api-core pnpm jest --testPathPatterns=<pattern>`. Nunca en local.
- PRs van contra `develop` (no `main`).
- `restaurantId` viene del JWT (`@CurrentUser()`), **nunca** del body/path.

---

## Task 1: Agregar dependencias `countries-and-timezones` y `currency-codes`

**Files:**
- Modify: `apps/api-core/package.json`
- Modify: `apps/api-core/pnpm-lock.yaml` (auto)

- [ ] **Step 1: Editar `package.json`**

Agregar a `dependencies` (mantener orden alfabético):

```json
    "countries-and-timezones": "^3.6.0",
    "currency-codes": "^2.1.0",
```

- [ ] **Step 2: Instalar dentro del contenedor**

```bash
docker compose exec -T res-api-core pnpm install
```

Expected: pnpm-lock.yaml actualizado, sin errores.

- [ ] **Step 3: Verificar import básico**

```bash
docker compose exec -T res-api-core node -e "console.log(require('countries-and-timezones').getCountry('CL').timezones)"
docker compose exec -T res-api-core node -e "console.log(require('currency-codes').code('USD').currency)"
```

Expected:
- Primera: `[ 'America/Santiago', 'Pacific/Easter' ]` (o similar).
- Segunda: `US Dollar`.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/package.json apps/api-core/pnpm-lock.yaml
git commit -m "chore(api): add countries-and-timezones + currency-codes deps"
```

---

## Task 2: Crear `RestaurantNotFoundException`

`DuplicateRestaurantException` ya existe en `restaurants.exceptions.ts`. El service necesita lanzar 404 cuando el restaurante (o su settings) no existe; hoy no hay excepción tipada.

**Files:**
- Modify: `apps/api-core/src/restaurants/exceptions/restaurants.exceptions.ts`

- [ ] **Step 1: Agregar la excepción al final del archivo existente**

```ts
/**
 * Thrown when a restaurant (or its settings row) cannot be found by id.
 */
export class RestaurantNotFoundException extends BaseException {
  constructor(restaurantId: string) {
    super(
      `Restaurant '${restaurantId}' not found`,
      HttpStatus.NOT_FOUND,
      'RESTAURANT_NOT_FOUND',
      { restaurantId },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/restaurants/exceptions/restaurants.exceptions.ts
git commit -m "feat(restaurants): add RestaurantNotFoundException"
```

---

## Task 3: Crear `TimezoneNotAvailableForCountryException`

**Files:**
- Modify: `apps/api-core/src/restaurants/exceptions/restaurants.exceptions.ts`

- [ ] **Step 1: Agregar excepción**

Al final del mismo archivo de Task 2:

```ts
/**
 * Thrown when a timezone is not part of the IANA timezones associated with
 * the restaurant's current country (lookup via countries-and-timezones).
 */
export class TimezoneNotAvailableForCountryException extends BaseException {
  constructor(timezone: string, country: string) {
    super(
      `La zona horaria '${timezone}' no está disponible para el país '${country}'`,
      HttpStatus.BAD_REQUEST,
      'TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY',
      { timezone, country },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/restaurants/exceptions/restaurants.exceptions.ts
git commit -m "feat(restaurants): add TimezoneNotAvailableForCountryException"
```

---

## Task 4: Validator custom `IsValidCurrencyCode` (TDD)

Decorator class-validator que delega a `currency-codes` para validar un código ISO 4217.

**Files:**
- Create: `apps/api-core/src/restaurants/dto/validators/is-valid-currency-code.validator.ts`
- Create: `apps/api-core/src/restaurants/dto/validators/is-valid-currency-code.validator.spec.ts`

- [ ] **Step 1: Escribir el spec (RED)**

```ts
// apps/api-core/src/restaurants/dto/validators/is-valid-currency-code.validator.spec.ts
import { validate } from 'class-validator';
import { IsValidCurrencyCode } from './is-valid-currency-code.validator';

class Wrapper {
  @IsValidCurrencyCode()
  currency!: string;
}

const validateValue = async (value: string) => {
  const w = new Wrapper();
  w.currency = value;
  return validate(w);
};

describe('IsValidCurrencyCode', () => {
  it('accepts a valid ISO 4217 code (USD)', async () => {
    expect(await validateValue('USD')).toHaveLength(0);
  });

  it('accepts CLP', async () => {
    expect(await validateValue('CLP')).toHaveLength(0);
  });

  it('rejects an unassigned code (XXX)', async () => {
    const errors = await validateValue('XXX');
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('IsValidCurrencyCode');
  });

  it('rejects lowercase (usd)', async () => {
    const errors = await validateValue('usd');
    expect(errors).toHaveLength(1);
  });

  it('rejects empty string', async () => {
    const errors = await validateValue('');
    expect(errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Verificar que falla**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=is-valid-currency-code.validator.spec
```

Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el validator (GREEN)**

```ts
// apps/api-core/src/restaurants/dto/validators/is-valid-currency-code.validator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import cc from 'currency-codes';

@ValidatorConstraint({ name: 'IsValidCurrencyCode', async: false })
class IsValidCurrencyCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    // currency-codes is case-sensitive; require uppercase.
    if (value !== value.toUpperCase()) return false;
    return cc.code(value) !== undefined;
  }

  defaultMessage(): string {
    return 'currency debe ser un código ISO 4217 válido (ej: USD, CLP, EUR)';
  }
}

export function IsValidCurrencyCode(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsValidCurrencyCodeConstraint,
    });
  };
}
```

> Nota: `currency-codes` exporta `cc` como default. Si TypeScript se queja con `esModuleInterop`, usar `import * as cc from 'currency-codes'`.

- [ ] **Step 4: Verificar que pasa**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=is-valid-currency-code.validator.spec
```

Expected: PASS — 5/5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/restaurants/dto/validators/
git commit -m "feat(restaurants): add IsValidCurrencyCode class-validator decorator"
```

---

## Task 5: Crear `UpdateRestaurantSettingsDto`

DTO de entrada del nuevo PATCH /settings. Solo valida shape; la regla `timezone ∈ country.timezones` vive en el service (depende de BD).

**Files:**
- Create: `apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsValidCurrencyCode } from './validators/is-valid-currency-code.validator';

/**
 * Body del `PATCH /v1/restaurants/settings`.
 *
 * Diseño (ver spec 2026-05-31):
 * - `country` NO está acá: es read-only en este endpoint (driven por onboarding).
 * - `thousandsSeparator` NO está acá: el backend lo deriva de `decimalSeparator`
 *   (`.` ↔ `,`) para eliminar combinaciones inválidas.
 * - `timezone` solo se valida en formato string; la regla "pertenece al country"
 *   vive en RestaurantsService.updateSettings (depende de BD).
 *
 * El ValidationPipe global usa `whitelist: true`, así que campos extra del
 * cliente (ej. `restaurantId`, `country`) se descartan silenciosamente antes
 * de llegar al controller.
 */
export class UpdateRestaurantSettingsDto {
  @ApiPropertyOptional({ example: 'Mi Restaurante', maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({
    example: 'America/Santiago',
    description: 'IANA timezone; debe pertenecer al country actual del restaurante',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Código ISO 4217' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsValidCurrencyCode()
  currency?: string;

  @ApiPropertyOptional({ example: '.', enum: ['.', ','] })
  @IsOptional()
  @IsIn(['.', ','])
  decimalSeparator?: string;
}
```

- [ ] **Step 2: Verificar que el build TS pasa**

```bash
docker compose exec -T res-api-core pnpm exec tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts
git commit -m "feat(restaurants): add UpdateRestaurantSettingsDto"
```

---

## Task 6: Extender `RestaurantSettingsDto` con `name` + `slug`

**Files:**
- Modify: `apps/api-core/src/restaurants/dto/restaurant-settings.dto.ts`

- [ ] **Step 1: Editar el DTO**

Reemplazar el archivo completo:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class RestaurantSettingsDto {
  @ApiProperty({ example: 'Mi Restaurante' })
  name: string;

  @ApiProperty({ example: 'mi-restaurante', description: 'URL slug; read-only en la UI' })
  slug: string;

  @ApiProperty({ example: 'America/Santiago' })
  timezone: string;

  @ApiProperty({ example: 'CL', description: 'ISO 3166-1 alpha-2; read-only en este endpoint' })
  country: string;

  @ApiProperty({ example: 'CLP', description: 'ISO 4217 currency code' })
  currency: string;

  @ApiProperty({ example: ',' })
  decimalSeparator: string;

  @ApiProperty({ example: '.' })
  thousandsSeparator: string;
}

// Defaults applied when a restaurant has no settings row yet.
export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettingsDto = {
  name: '',
  slug: '',
  timezone: 'UTC',
  country: 'CL',
  currency: 'CLP',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};
```

- [ ] **Step 2: Verificar TS y tests existentes (para detectar consumidores rotos)**

```bash
docker compose exec -T res-api-core pnpm exec tsc --noEmit
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants
```

Expected: TS sin errores (los nuevos campos son requeridos pero el único consumidor del shape completo es el controller, que se actualiza en Task 9; el resto compila). Si hay rotura en tests previos por shape extendido, los arreglamos en sus respectivas tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/restaurants/dto/restaurant-settings.dto.ts
git commit -m "feat(restaurants): extend RestaurantSettingsDto with name + slug"
```

---

## Task 7: Repository — método `updateWithSettings` (TDD)

Actualiza `Restaurant` + `RestaurantSettings` en una transacción única. El `where: { restaurantId }` explícito en settings es defense-in-depth multi-tenant.

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurant.repository.ts`
- Create: `apps/api-core/src/restaurants/restaurant.repository.spec.ts`

- [ ] **Step 1: Escribir el test (RED)**

```ts
// apps/api-core/src/restaurants/restaurant.repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantRepository } from './restaurant.repository';
import { PrismaService } from '../prisma/prisma.service';

const restaurantUpdate = jest.fn();
const settingsUpdate = jest.fn();
const findUniqueOrThrow = jest.fn();

const mockPrisma = {
  $transaction: jest.fn((cb: (tx: any) => any) =>
    cb({
      restaurant: { update: restaurantUpdate, findUniqueOrThrow },
      restaurantSettings: { update: settingsUpdate },
    }),
  ),
};

describe('RestaurantRepository.updateWithSettings', () => {
  let repo: RestaurantRepository;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    repo = moduleRef.get(RestaurantRepository);
    jest.clearAllMocks();
  });

  it('updates restaurant and settings in a single transaction', async () => {
    findUniqueOrThrow.mockResolvedValue({ id: 'r1', name: 'Nuevo', slug: 'nuevo', settings: {} });

    await repo.updateWithSettings('r1', {
      restaurant: { name: 'Nuevo', slug: 'nuevo' },
      settings: { timezone: 'America/Santiago' },
    });

    expect(restaurantUpdate).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { name: 'Nuevo', slug: 'nuevo' },
    });
    expect(settingsUpdate).toHaveBeenCalledWith({
      where: { restaurantId: 'r1' },
      data: { timezone: 'America/Santiago' },
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'r1' },
      include: { settings: true },
    });
  });

  it('skips restaurant update when restaurant partial is empty', async () => {
    findUniqueOrThrow.mockResolvedValue({});
    await repo.updateWithSettings('r1', {
      restaurant: {},
      settings: { currency: 'USD' },
    });
    expect(restaurantUpdate).not.toHaveBeenCalled();
    expect(settingsUpdate).toHaveBeenCalled();
  });

  it('skips settings update when settings partial is empty', async () => {
    findUniqueOrThrow.mockResolvedValue({});
    await repo.updateWithSettings('r1', {
      restaurant: { name: 'X' },
      settings: {},
    });
    expect(settingsUpdate).not.toHaveBeenCalled();
    expect(restaurantUpdate).toHaveBeenCalled();
  });

  it('uses restaurantId in the settings WHERE clause (multi-tenant safety)', async () => {
    findUniqueOrThrow.mockResolvedValue({});
    await repo.updateWithSettings('r1', {
      restaurant: {},
      settings: { country: 'US' },
    });
    expect(settingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: 'r1' } }),
    );
  });
});
```

- [ ] **Step 2: Verificar que falla**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurant.repository.spec
```

Expected: FAIL — método `updateWithSettings` no existe.

- [ ] **Step 3: Implementar el método**

Agregar al final de la clase `RestaurantRepository` en `restaurant.repository.ts`:

```ts
async updateWithSettings(
  restaurantId: string,
  data: {
    restaurant: Prisma.RestaurantUpdateInput;
    settings: Prisma.RestaurantSettingsUpdateInput;
  },
): Promise<RestaurantWithSettings> {
  return this.prisma.$transaction(async (tx) => {
    if (Object.keys(data.restaurant).length > 0) {
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: data.restaurant,
      });
    }
    if (Object.keys(data.settings).length > 0) {
      await tx.restaurantSettings.update({
        where: { restaurantId },
        data: data.settings,
      });
    }
    return tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: { settings: true },
    });
  });
}
```

- [ ] **Step 4: Verificar que pasan**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurant.repository.spec
```

Expected: PASS — 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/restaurants/restaurant.repository.ts apps/api-core/src/restaurants/restaurant.repository.spec.ts
git commit -m "feat(restaurants): add Repository.updateWithSettings atomic update"
```

---

## Task 8: Service — método `updateSettings` (TDD)

El corazón del módulo. Orquesta validación de regla de negocio (timezone vs country), derivación de separador, slug regen y persistencia. Todo en un solo método.

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurants.service.ts`
- Create: `apps/api-core/src/restaurants/restaurants.service.spec.ts`

> Nota: hoy no existe `restaurants.service.spec.ts`. Lo creamos con scaffolding completo.

- [ ] **Step 1: Scaffold del spec con primer test (happy path: solo `currency`)**

```ts
// apps/api-core/src/restaurants/restaurants.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { TimezoneService } from './timezone.service';
import {
  RestaurantNotFoundException,
  TimezoneNotAvailableForCountryException,
} from './exceptions/restaurants.exceptions';

const mockRepo = {
  findByIdWithSettings: jest.fn(),
  findBySlug: jest.fn(),
  updateWithSettings: jest.fn(),
};
const mockTimezoneService = { invalidate: jest.fn() };

const makeRestaurant = (overrides: Partial<{ name: string; slug: string }> = {}) => ({
  id: 'r1',
  name: 'Original',
  slug: 'original',
  ...overrides,
  settings: {
    timezone: 'America/Santiago',
    country: 'CL',
    currency: 'CLP',
    decimalSeparator: ',',
    thousandsSeparator: '.',
  },
});

describe('RestaurantsService.updateSettings', () => {
  let service: RestaurantsService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: RestaurantRepository, useValue: mockRepo },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();
    service = moduleRef.get(RestaurantsService);
    jest.clearAllMocks();
    mockRepo.findBySlug.mockResolvedValue(null);
    mockRepo.updateWithSettings.mockImplementation(async (id, _data) => makeRestaurant({ name: 'Original' }));
  });

  it('updates currency (passthrough; no timezone or name changes)', async () => {
    mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

    await service.updateSettings('r1', { currency: 'USD' });

    expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
      restaurant: {},
      settings: { currency: 'USD' },
    });
    expect(mockTimezoneService.invalidate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verificar RED**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants.service.spec
```

Expected: FAIL — método `updateSettings` no existe.

- [ ] **Step 3: Inyectar `TimezoneService` y agregar esqueleto del método al service**

Editar `apps/api-core/src/restaurants/restaurants.service.ts`:

1) Sumar imports al top:
```ts
import ct from 'countries-and-timezones';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';
import {
  RestaurantNotFoundException,
  TimezoneNotAvailableForCountryException,
} from './exceptions/restaurants.exceptions';
import { RestaurantSettingsDto } from './dto/restaurant-settings.dto';
import { TimezoneService } from './timezone.service';
```

2) Modificar el constructor (inyectar `TimezoneService`):
```ts
constructor(
  private readonly restaurantRepository: RestaurantRepository,
  private readonly timezoneService: TimezoneService,
) {}
```

3) Agregar el método al final de la clase:
```ts
async updateSettings(
  restaurantId: string,
  dto: UpdateRestaurantSettingsDto,
): Promise<RestaurantSettingsDto> {
  const current = await this.restaurantRepository.findByIdWithSettings(restaurantId);
  if (!current || !current.settings) {
    throw new RestaurantNotFoundException(restaurantId);
  }

  if (dto.timezone && !this.isTimezoneAllowedForCountry(dto.timezone, current.settings.country)) {
    throw new TimezoneNotAvailableForCountryException(dto.timezone, current.settings.country);
  }

  const thousandsSeparator = dto.decimalSeparator
    ? (dto.decimalSeparator === '.' ? ',' : '.')
    : undefined;

  const newSlug = dto.name && dto.name !== current.name
    ? await this.generateSlug(dto.name)
    : undefined;

  const updated = await this.restaurantRepository.updateWithSettings(restaurantId, {
    restaurant: {
      ...(dto.name ? { name: dto.name } : {}),
      ...(newSlug ? { slug: newSlug } : {}),
    },
    settings: {
      ...(dto.timezone ? { timezone: dto.timezone } : {}),
      ...(dto.currency ? { currency: dto.currency } : {}),
      ...(dto.decimalSeparator
        ? { decimalSeparator: dto.decimalSeparator, thousandsSeparator }
        : {}),
    },
  });

  if (dto.timezone && dto.timezone !== current.settings.timezone) {
    await this.timezoneService.invalidate(restaurantId);
  }

  return this.toSettingsDto(updated);
}

private isTimezoneAllowedForCountry(timezone: string, country: string): boolean {
  return ct.getCountry(country)?.timezones?.includes(timezone) ?? false;
}

private toSettingsDto(
  restaurant: NonNullable<Awaited<ReturnType<RestaurantRepository['findByIdWithSettings']>>>,
): RestaurantSettingsDto {
  const s = restaurant.settings!;
  return {
    name: restaurant.name,
    slug: restaurant.slug,
    timezone: s.timezone,
    country: s.country,
    currency: s.currency,
    decimalSeparator: s.decimalSeparator,
    thousandsSeparator: s.thousandsSeparator,
  };
}
```

- [ ] **Step 4: Verificar que el primer test pasa**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants.service.spec
```

Expected: PASS — 1/1.

- [ ] **Step 5: Agregar tests para timezone (RED)**

Agregar al describe block:

```ts
it('updates timezone when it belongs to the current country', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await service.updateSettings('r1', { timezone: 'Pacific/Easter' });

  expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
    restaurant: {},
    settings: { timezone: 'Pacific/Easter' },
  });
});

it('throws TimezoneNotAvailableForCountry when timezone does not belong to country', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await expect(
    service.updateSettings('r1', { timezone: 'America/New_York' }),
  ).rejects.toThrow(TimezoneNotAvailableForCountryException);

  expect(mockRepo.updateWithSettings).not.toHaveBeenCalled();
});

it('throws TimezoneNotAvailableForCountry for unknown IANA strings', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await expect(
    service.updateSettings('r1', { timezone: 'Mars/Olympus' }),
  ).rejects.toThrow(TimezoneNotAvailableForCountryException);
});

it('invalidates timezone cache when timezone changes', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await service.updateSettings('r1', { timezone: 'Pacific/Easter' });

  expect(mockTimezoneService.invalidate).toHaveBeenCalledWith('r1');
});

it('does NOT invalidate cache when timezone equals current value', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await service.updateSettings('r1', { timezone: 'America/Santiago' });

  expect(mockTimezoneService.invalidate).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Verificar que pasan (la lógica ya está implementada en Step 3)**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants.service.spec
```

Expected: PASS — 6/6.

- [ ] **Step 7: Agregar tests de separador decimal (RED → GREEN, ya implementado)**

```ts
it('derives thousandsSeparator from decimalSeparator (. → ,)', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await service.updateSettings('r1', { decimalSeparator: '.' });

  expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
    restaurant: {},
    settings: { decimalSeparator: '.', thousandsSeparator: ',' },
  });
});

it('derives thousandsSeparator from decimalSeparator (, → .)', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await service.updateSettings('r1', { decimalSeparator: ',' });

  expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
    restaurant: {},
    settings: { decimalSeparator: ',', thousandsSeparator: '.' },
  });
});
```

Run:
```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants.service.spec
```

Expected: PASS — 8/8.

- [ ] **Step 8: Agregar tests de name + slug regen**

```ts
it('regenerates slug when name changes', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant({ name: 'Original', slug: 'original' }));

  await service.updateSettings('r1', { name: 'Nuevo Nombre' });

  expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
    restaurant: { name: 'Nuevo Nombre', slug: expect.stringMatching(/^nuevo-nombre/) },
    settings: {},
  });
});

it('does NOT regenerate slug when name equals current', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant({ name: 'Original', slug: 'original' }));

  await service.updateSettings('r1', { name: 'Original' });

  expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
    restaurant: { name: 'Original' },
    settings: {},
  });
});
```

Run:
```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants.service.spec
```

Expected: PASS — 10/10.

- [ ] **Step 9: Agregar tests de edge cases**

```ts
it('throws RestaurantNotFoundException when restaurant does not exist', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(null);

  await expect(service.updateSettings('missing', { currency: 'USD' }))
    .rejects.toThrow(RestaurantNotFoundException);

  expect(mockRepo.updateWithSettings).not.toHaveBeenCalled();
});

it('throws RestaurantNotFoundException when settings row is missing', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue({ ...makeRestaurant(), settings: null });

  await expect(service.updateSettings('r1', { currency: 'USD' }))
    .rejects.toThrow(RestaurantNotFoundException);
});

it('empty body is a no-op (calls repo with empty partials)', async () => {
  mockRepo.findByIdWithSettings.mockResolvedValue(makeRestaurant());

  await service.updateSettings('r1', {});

  expect(mockRepo.updateWithSettings).toHaveBeenCalledWith('r1', {
    restaurant: {},
    settings: {},
  });
});
```

Run:
```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants.service.spec
```

Expected: PASS — 13/13.

- [ ] **Step 10: Commit**

```bash
git add apps/api-core/src/restaurants/restaurants.service.ts apps/api-core/src/restaurants/restaurants.service.spec.ts
git commit -m "feat(restaurants): add RestaurantsService.updateSettings (TDD)"
```

---

## Task 9: Controller — extender GET, agregar PATCH, eliminar rename

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurants.controller.ts`
- Modify: `apps/api-core/src/restaurants/restaurants.controller.spec.ts`

- [ ] **Step 1: Editar el controller**

Reemplazar el contenido completo de `apps/api-core/src/restaurants/restaurants.controller.ts`:

```ts
import { Controller, Patch, Get, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';
import { RestaurantSettingsDto, DEFAULT_RESTAURANT_SETTINGS } from './dto/restaurant-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller({ version: '1', path: 'restaurants' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get restaurant settings (name, slug + display preferences)' })
  @ApiResponse({ status: 200, type: RestaurantSettingsDto })
  async getSettings(
    @CurrentUser() user: { restaurantId: string },
  ): Promise<RestaurantSettingsDto> {
    const restaurant = await this.restaurantsService.findByIdWithSettings(user.restaurantId);
    if (!restaurant || !restaurant.settings) return DEFAULT_RESTAURANT_SETTINGS;
    return {
      name: restaurant.name,
      slug: restaurant.slug,
      timezone: restaurant.settings.timezone,
      country: restaurant.settings.country,
      currency: restaurant.settings.currency,
      decimalSeparator: restaurant.settings.decimalSeparator,
      thousandsSeparator: restaurant.settings.thousandsSeparator,
    };
  }

  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update restaurant settings (name, timezone, currency, decimalSeparator). ADMIN only.' })
  @ApiResponse({ status: 200, type: RestaurantSettingsDto })
  @ApiResponse({ status: 400, description: 'Validación de shape o regla timezone ↔ country' })
  @ApiResponse({ status: 403, description: 'No es ADMIN' })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  @ApiResponse({ status: 409, description: 'Slug duplicado al regenerar a partir del nuevo nombre' })
  async updateSettings(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateRestaurantSettingsDto,
  ): Promise<RestaurantSettingsDto> {
    return this.restaurantsService.updateSettings(user.restaurantId, dto);
  }
}
```

- [ ] **Step 2: Actualizar el spec del controller**

Reemplazar `apps/api-core/src/restaurants/restaurants.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { DEFAULT_RESTAURANT_SETTINGS } from './dto/restaurant-settings.dto';

const mockRestaurantsService = {
  findByIdWithSettings: jest.fn(),
  updateSettings: jest.fn(),
};

describe('RestaurantsController', () => {
  let controller: RestaurantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantsController],
      providers: [{ provide: RestaurantsService, useValue: mockRestaurantsService }],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../auth/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RestaurantsController>(RestaurantsController);
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('returns full shape (name, slug, settings) when restaurant + settings exist', async () => {
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue({
        id: 'r1',
        name: 'Mi Resto',
        slug: 'mi-resto',
        settings: {
          timezone: 'America/Santiago',
          country: 'CL',
          currency: 'CLP',
          decimalSeparator: ',',
          thousandsSeparator: '.',
        },
      });

      const result = await controller.getSettings({ restaurantId: 'r1' });

      expect(result).toEqual({
        name: 'Mi Resto',
        slug: 'mi-resto',
        timezone: 'America/Santiago',
        country: 'CL',
        currency: 'CLP',
        decimalSeparator: ',',
        thousandsSeparator: '.',
      });
    });

    it('returns defaults when restaurant has no settings row', async () => {
      mockRestaurantsService.findByIdWithSettings.mockResolvedValue({ id: 'r1', name: 'X', slug: 'x', settings: null });
      const result = await controller.getSettings({ restaurantId: 'r1' });
      expect(result).toEqual(DEFAULT_RESTAURANT_SETTINGS);
    });
  });

  describe('updateSettings', () => {
    it('delegates to service with restaurantId from JWT and the DTO', async () => {
      const updated = {
        name: 'Nuevo',
        slug: 'nuevo',
        timezone: 'America/Santiago',
        country: 'CL',
        currency: 'USD',
        decimalSeparator: ',',
        thousandsSeparator: '.',
      };
      mockRestaurantsService.updateSettings.mockResolvedValue(updated);

      const result = await controller.updateSettings({ restaurantId: 'r1' }, { name: 'Nuevo', currency: 'USD' });

      expect(mockRestaurantsService.updateSettings).toHaveBeenCalledWith('r1', { name: 'Nuevo', currency: 'USD' });
      expect(result).toEqual(updated);
    });
  });
});
```

- [ ] **Step 3: Correr el spec del controller**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants.controller.spec
```

Expected: PASS — 3/3.

- [ ] **Step 4: Correr la suite completa del módulo restaurants para detectar regresiones**

```bash
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants
```

Expected: PASS (puede mostrar el `rename.e2e-spec.ts` legacy fallando — se elimina en Task 10).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/restaurants/restaurants.controller.ts apps/api-core/src/restaurants/restaurants.controller.spec.ts
git commit -m "feat(restaurants): unify rename + settings into PATCH /settings (ADMIN)"
```

---

## Task 10: Cleanup del legacy `rename`

Eliminar el endpoint viejo, su DTO, el método `rename` del service y el e2e correspondiente.

**Files:**
- Delete: `apps/api-core/src/restaurants/dto/rename-restaurant.dto.ts`
- Modify: `apps/api-core/src/restaurants/restaurants.service.ts`
- Delete: `apps/api-core/test/restaurants/rename.e2e-spec.ts`
- Delete: `apps/api-core/test/restaurants/test-rename.db`

- [ ] **Step 1: Borrar el DTO legacy**

```bash
rm apps/api-core/src/restaurants/dto/rename-restaurant.dto.ts
```

- [ ] **Step 2: Eliminar el método `rename` del service**

Editar `apps/api-core/src/restaurants/restaurants.service.ts`: localizar y borrar el bloque:

```ts
async rename(id: string, name: string): Promise<Restaurant> {
  return this.restaurantRepository.update(id, { name });
}
```

- [ ] **Step 3: Borrar el e2e legacy + su BD**

```bash
rm apps/api-core/test/restaurants/rename.e2e-spec.ts
rm -f apps/api-core/test/restaurants/test-rename.db
```

- [ ] **Step 4: Verificar TS y unit tests del módulo (no debe romperse nada)**

```bash
docker compose exec -T res-api-core pnpm exec tsc --noEmit
docker compose exec -T res-api-core pnpm jest --testPathPatterns=restaurants
```

Expected: TS sin errores, unit tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api-core/src/restaurants apps/api-core/test/restaurants
git commit -m "refactor(restaurants): remove legacy rename endpoint, DTO, service method and e2e"
```

---

## Task 11: E2E — extender `settings.e2e-spec.ts`

Sumar la matriz completa del nuevo PATCH al e2e existente. El archivo ya bootea Nest con SQLite via `db push`; reutilizamos el helper.

**Files:**
- Modify: `apps/api-core/test/restaurants/settings.e2e-spec.ts`

- [ ] **Step 1: Leer el archivo actual para entender el patrón de seed**

```bash
docker compose exec -T res-api-core wc -l test/restaurants/settings.e2e-spec.ts
```

Localizar el `seedRestaurant(prisma, suffix)` y el bloque `describe('GET /v1/restaurants/settings')`. Agregamos un segundo describe `describe('PATCH /v1/restaurants/settings')` debajo, reutilizando `bootstrapApp` y `seedRestaurant`. Agregamos también un helper `seedRestaurantSettings(prisma, restaurantId, overrides)` si no existe ya, para setear `country='CL'` explícito (el seed actual solo setea timezone).

- [ ] **Step 2: Agregar los casos PATCH**

Pegar este bloque dentro del archivo, al mismo nivel que el `describe` existente del GET (justo antes del cierre del `describe` raíz). Adaptar nombres a los helpers/variables locales si difieren del snippet:

```ts
describe('PATCH /v1/restaurants/settings', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp());
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  beforeEach(async () => {
    await prisma.restaurantSettings.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.restaurant.deleteMany();
  });

  it('401 without token', async () => {
    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .send({ currency: 'USD' })
      .expect(401);
  });

  it('403 when caller is MANAGER', async () => {
    const { restaurant } = await seedRestaurant(prisma, 'mgr');
    const passwordHash = await bcrypt.hash('Manager1234!', 10);
    const manager = await prisma.user.create({
      data: {
        email: `manager-${Date.now()}@test.com`,
        passwordHash, role: 'MANAGER', isActive: true,
        restaurantId: restaurant.id,
      },
    });
    const cookie = await loginCookie(app, manager.email, 'Manager1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ currency: 'USD' })
      .expect(403);
  });

  it('200 with empty body — no-op', async () => {
    const { admin } = await seedRestaurant(prisma, 'empty');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({ country: 'CL' });
  });

  it('200 updates currency to a valid ISO 4217 code', async () => {
    const { admin } = await seedRestaurant(prisma, 'cur');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ currency: 'USD' })
      .expect(200);

    expect(res.body.currency).toBe('USD');
  });

  it('400 on invalid currency code', async () => {
    const { admin } = await seedRestaurant(prisma, 'badcur');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ currency: 'XXX' })
      .expect(400);
  });

  it('200 derives thousandsSeparator from decimalSeparator (. → ,)', async () => {
    const { admin } = await seedRestaurant(prisma, 'sep');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ decimalSeparator: '.' })
      .expect(200);

    expect(res.body.decimalSeparator).toBe('.');
    expect(res.body.thousandsSeparator).toBe(',');
  });

  it('400 on disallowed decimalSeparator', async () => {
    const { admin } = await seedRestaurant(prisma, 'badsep');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ decimalSeparator: ';' })
      .expect(400);
  });

  it('200 updates timezone that belongs to the country', async () => {
    const { admin } = await seedRestaurant(prisma, 'tz');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ timezone: 'America/Santiago' })
      .expect(200);

    expect(res.body.timezone).toBe('America/Santiago');
  });

  it('400 TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY when timezone is foreign to country', async () => {
    const { admin } = await seedRestaurant(prisma, 'badtz');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ timezone: 'America/New_York' })
      .expect(400);

    expect(res.body.code).toBe('TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY');
  });

  it('200 renames the restaurant and regenerates slug', async () => {
    const { restaurant, admin } = await seedRestaurant(prisma, 'name');
    const oldSlug = restaurant.slug;
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'Mi Resto Renombrado' })
      .expect(200);

    expect(res.body.name).toBe('Mi Resto Renombrado');
    expect(res.body.slug).not.toBe(oldSlug);
    expect(res.body.slug.startsWith('mi-resto-renombrado')).toBe(true);
  });

  it('400 on empty name', async () => {
    const { admin } = await seedRestaurant(prisma, 'emptyname');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: '' })
      .expect(400);
  });

  it('400 on name longer than 255 chars', async () => {
    const { admin } = await seedRestaurant(prisma, 'longname');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'x'.repeat(256) })
      .expect(400);
  });

  it('admin of B only affects B (cross-tenant isolation)', async () => {
    const { restaurant: a } = await seedRestaurant(prisma, 'A');
    const { admin: adminB } = await seedRestaurant(prisma, 'B');
    const cookieB = await loginCookie(app, adminB.email, 'Admin1234!');

    await request(app.getHttpServer())
      .patch('/v1/restaurants/settings')
      .set('Cookie', cookieB)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .send({ name: 'B Renamed' })
      .expect(200);

    const aAfter = await prisma.restaurant.findUnique({ where: { id: a.id } });
    expect(aAfter?.name).toBe(a.name);
    expect(aAfter?.slug).toBe(a.slug);
  });
});

describe('GET /v1/restaurants/settings — extended shape', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => { ({ app, prisma } = await bootstrapApp()); });
  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  beforeEach(async () => {
    await prisma.restaurantSettings.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.restaurant.deleteMany();
  });

  it('returns name and slug along with settings', async () => {
    const { restaurant, admin } = await seedRestaurant(prisma, 'shape');
    const cookie = await loginCookie(app, admin.email, 'Admin1234!');

    const res = await request(app.getHttpServer())
      .get('/v1/restaurants/settings')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_TEST_ORIGIN)
      .expect(200);

    expect(res.body).toMatchObject({
      name: restaurant.name,
      slug: restaurant.slug,
      country: 'CL',
    });
    expect(res.body.timezone).toBeDefined();
  });
});
```

> Si `seedRestaurant` no setea `country` (solo timezone), eso ya cumple — el default del schema es `'CL'`. Para los tests de `PATCH /settings` con name más largo, los casos de `409 DUPLICATE_RESTAURANT` quedan fuera de scope: SQLite no aplica el UNIQUE de igual forma; basta con probarlo manualmente o agregar el caso si el test infrastructure lo permite.

- [ ] **Step 3: Correr el e2e**

```bash
docker compose exec -T res-api-core pnpm jest --config jest-e2e.json --testPathPatterns=settings.e2e-spec
```

Expected: TODOS PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/test/restaurants/settings.e2e-spec.ts
git commit -m "test(restaurants): e2e coverage for PATCH /v1/restaurants/settings"
```

---

## Task 12: Actualizar `restaurante.module.info.md`

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurante.module.info.md`

- [ ] **Step 1: Reemplazar el contenido completo**

```markdown
### Restaurants

#### Get settings — `GET /v1/restaurants/settings`

Devuelve `{ name, slug, country, timezone, currency, decimalSeparator, thousandsSeparator }`.
`country` y `slug` se renderizan en UI como read-only.

#### Update settings — `PATCH /v1/restaurants/settings` (ADMIN only)

Campos opcionales: `name`, `timezone`, `currency`, `decimalSeparator`.

- `name` → si cambia, regenera `slug` (mantiene el mismo flujo de `generateSlug`).
- `timezone` → debe pertenecer a los timezones del `country` actual (lookup `countries-and-timezones`).
- `currency` → ISO 4217 válido (`currency-codes`).
- `decimalSeparator` → `.` o `,`. El backend deriva `thousandsSeparator` excluyente.

E2E: `test/restaurants/settings.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Cookie ausente |
| MANAGER / BASIC | 403 | Solo ADMIN |
| Body vacío `{}` | 200 | No-op, devuelve estado actual |
| name vacío / > 255 | 400 | DTO `@Length(1,255)` |
| name nuevo único | 200 | Regenera slug, lo devuelve |
| timezone que no pertenece al country | 400 | `TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY` |
| currency `'XXX'` | 400 | `IsValidCurrencyCode` |
| decimalSeparator `';'` | 400 | DTO `@IsIn(['.', ','])` |
| Update solo `decimalSeparator='.'` | 200 | `thousandsSeparator` se setea a `','` |
| Aislamiento por restaurantId | 200 | ADMIN de B no toca A |

#### Notas de implementación

- `UpdateRestaurantSettingsDto` valida shape; la regla `timezone ∈ country.timezones` vive en el service.
- `RestaurantsService.updateSettings` regenera slug si `name` cambia y deriva `thousandsSeparator`.
- `restaurant.repository.updateWithSettings` envuelve `Restaurant.update` + `RestaurantSettings.update` en una transacción Prisma.
- `TimezoneService.invalidate(restaurantId)` se llama solo si `timezone` cambió, para forzar refresh del cache del módulo.

#### Seguridad multi-tenant

Todos los endpoints del módulo derivan `restaurantId` exclusivamente del JWT vía `@CurrentUser()`. Ningún endpoint acepta `restaurantId` ni `id` en path o body. Esto vuelve estructuralmente imposible la operación cross-tenant.

- Controller: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` para el PATCH.
- Service: primer call siempre `findByIdWithSettings(restaurantId)`; `null` → `RestaurantNotFoundException` (404), no 403, para no filtrar existencia.
- Repository: `restaurantSettings.update` usa `where: { restaurantId }` explícito (defense in depth).
- DTO: no declara `restaurantId`; `whitelist: true` del `ValidationPipe` descarta campos extra.

#### Endpoint eliminado

`PATCH /v1/restaurants/name` se reemplaza por el PATCH unificado. DTO `RenameRestaurantDto`, método `rename` del service y `test/restaurants/rename.e2e-spec.ts` borrados en el mismo PR.
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/restaurants/restaurante.module.info.md
git commit -m "docs(restaurants): module info — PATCH /settings unified"
```

---

## Task 13: UI — actualizar tipos en `lib/restaurant-settings.ts`

**Files:**
- Modify: `apps/ui/src/lib/restaurant-settings.ts`

- [ ] **Step 1: Leer el archivo y entender el shape actual**

```bash
cat apps/ui/src/lib/restaurant-settings.ts
```

- [ ] **Step 2: Extender el tipo y/o el hook**

Sumar `name: string` y `slug: string` al tipo de retorno; mantener el resto del shape igual. El llamado al endpoint no cambia.

Ejemplo (ajustar al estilo real del archivo):
```ts
export interface RestaurantSettings {
  name: string;
  slug: string;
  country: string;
  timezone: string;
  currency: string;
  decimalSeparator: string;
  thousandsSeparator: string;
}
```

- [ ] **Step 3: Verificar TS del proyecto UI**

```bash
docker compose exec -T res-ui pnpm exec tsc --noEmit
```

> Si la app UI no expone `tsc` por separado, usar `pnpm astro check` o lo que el proyecto tenga configurado.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/lib/restaurant-settings.ts
git commit -m "feat(ui): extend RestaurantSettings type with name + slug"
```

---

## Task 14: UI — reemplazar `dash/settings.astro`

**Files:**
- Modify: `apps/ui/src/pages/dash/settings.astro`

> Este archivo hoy está roto (consume `defaultReservationDuration`, un campo inexistente). Se reemplaza el contenido completo.

- [ ] **Step 1: Reemplazar el archivo**

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
---

<DashboardLayout>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-2xl font-bold text-slate-800">Configuración</h2>
    </div>

    <form id="settingsForm" class="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div>
        <label for="nameInput" class="block text-sm font-medium text-slate-700 mb-1">Nombre del restaurante</label>
        <input id="nameInput" name="name" type="text" maxlength="255" required
          class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="slugInput" class="block text-sm font-medium text-slate-700 mb-1">Slug (URL del kiosko)</label>
          <input id="slugInput" type="text" disabled
            class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" />
        </div>
        <div>
          <label for="countryInput" class="block text-sm font-medium text-slate-700 mb-1">País</label>
          <input id="countryInput" type="text" disabled
            class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="timezoneSelect" class="block text-sm font-medium text-slate-700 mb-1">Zona horaria</label>
          <select id="timezoneSelect" name="timezone"
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"></select>
        </div>
        <div>
          <label for="currencyInput" class="block text-sm font-medium text-slate-700 mb-1">Moneda (ISO 4217)</label>
          <input id="currencyInput" name="currency" type="text" maxlength="3"
            pattern="[A-Z]{3}"
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase" />
        </div>
      </div>

      <fieldset>
        <legend class="block text-sm font-medium text-slate-700 mb-1">Formato decimal</legend>
        <label class="inline-flex items-center mr-4">
          <input type="radio" name="decimalSeparator" value="." />
          <span class="ml-2 text-sm">Punto (1,234.56)</span>
        </label>
        <label class="inline-flex items-center">
          <input type="radio" name="decimalSeparator" value="," />
          <span class="ml-2 text-sm">Coma (1.234,56)</span>
        </label>
      </fieldset>

      <div class="flex items-center gap-3">
        <button id="saveBtn" type="submit"
          class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none disabled:opacity-50">
          Guardar
        </button>
        <p id="successMsg" class="hidden text-sm text-green-600">Configuración guardada</p>
        <p id="errorMsg" class="hidden text-sm text-red-600"></p>
      </div>
    </form>
  </div>
</DashboardLayout>

<script>
  import { apiFetch } from '../../lib/api';
  import ct from 'countries-and-timezones';

  const form = document.getElementById('settingsForm') as HTMLFormElement;
  const nameInput = document.getElementById('nameInput') as HTMLInputElement;
  const slugInput = document.getElementById('slugInput') as HTMLInputElement;
  const countryInput = document.getElementById('countryInput') as HTMLInputElement;
  const timezoneSelect = document.getElementById('timezoneSelect') as HTMLSelectElement;
  const currencyInput = document.getElementById('currencyInput') as HTMLInputElement;
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  const successMsg = document.getElementById('successMsg')!;
  const errorMsg = document.getElementById('errorMsg')!;

  let initial: any = null;

  async function load() {
    const res = await apiFetch('/v1/restaurants/settings');
    if (!res.ok) {
      errorMsg.textContent = 'Error al cargar la configuración';
      errorMsg.classList.remove('hidden');
      return;
    }
    const data = await res.json();
    initial = data;

    nameInput.value = data.name ?? '';
    slugInput.value = data.slug ?? '';
    countryInput.value = data.country ?? '';
    currencyInput.value = data.currency ?? '';

    // Populate timezone dropdown with the timezones of the current country.
    const tzs = ct.getCountry(data.country)?.timezones ?? [data.timezone];
    timezoneSelect.innerHTML = '';
    for (const tz of tzs) {
      const opt = document.createElement('option');
      opt.value = tz; opt.textContent = tz;
      if (tz === data.timezone) opt.selected = true;
      timezoneSelect.appendChild(opt);
    }

    // Decimal radio
    for (const r of form.querySelectorAll<HTMLInputElement>('input[name="decimalSeparator"]')) {
      r.checked = r.value === data.decimalSeparator;
    }
  }

  function buildPatch() {
    const fd = new FormData(form);
    const out: Record<string, string> = {};
    const name = String(fd.get('name') ?? '').trim();
    if (name && name !== initial?.name) out.name = name;
    const tz = String(fd.get('timezone') ?? '');
    if (tz && tz !== initial?.timezone) out.timezone = tz;
    const cur = String(fd.get('currency') ?? '').toUpperCase();
    if (cur && cur !== initial?.currency) out.currency = cur;
    const dec = String(fd.get('decimalSeparator') ?? '');
    if (dec && dec !== initial?.decimalSeparator) out.decimalSeparator = dec;
    return out;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    successMsg.classList.add('hidden');
    errorMsg.classList.add('hidden');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      const patch = buildPatch();
      const res = await apiFetch('/v1/restaurants/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const code = data?.code as string | undefined;
        errorMsg.textContent =
          code === 'TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY'
            ? 'La zona horaria no está disponible para tu país.'
            : code === 'DUPLICATE_RESTAURANT'
            ? 'Ya existe un restaurante con un nombre similar.'
            : data?.message || 'Error al guardar la configuración';
        errorMsg.classList.remove('hidden');
        return;
      }
      successMsg.classList.remove('hidden');
      setTimeout(() => successMsg.classList.add('hidden'), 4000);
      // Refrescar valores iniciales tras un guardado exitoso
      const updated = await res.json();
      initial = updated;
      slugInput.value = updated.slug ?? slugInput.value;
    } catch {
      errorMsg.textContent = 'Error de red al guardar la configuración';
      errorMsg.classList.remove('hidden');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  });

  load();
</script>
```

- [ ] **Step 2: Verificar que `countries-and-timezones` también está disponible en `apps/ui`**

```bash
docker compose exec -T res-ui pnpm list countries-and-timezones 2>/dev/null || docker compose exec -T res-ui pnpm add countries-and-timezones
```

- [ ] **Step 3: Verificar build UI**

```bash
docker compose exec -T res-ui pnpm astro check
docker compose exec -T res-ui pnpm build
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/pages/dash/settings.astro apps/ui/package.json apps/ui/pnpm-lock.yaml
git commit -m "feat(ui): replace dash/settings with restaurant config form"
```

---

## Task 15: Verificación end-to-end

- [ ] **Step 1: Levantar el stack**

```bash
docker compose up -d res-api-core res-ui res-db
```

- [ ] **Step 2: Smoke test backend manual**

```bash
# Login y guardar la cookie (ajustar credenciales al seed local; create-dummy si hace falta)
docker compose exec -T res-api-core pnpm run cli create-dummy

# Reemplazar EMAIL/PASSWORD por los del create-dummy
COOKIE=$(curl -s -c - -X POST http://localhost:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<EMAIL>","password":"<PASSWORD>"}' | awk '/access_token/{print $7}')

# GET settings
curl -s http://localhost:3000/v1/restaurants/settings \
  -H "Cookie: access_token=$COOKIE" | jq

# PATCH solo currency
curl -s -X PATCH http://localhost:3000/v1/restaurants/settings \
  -H "Cookie: access_token=$COOKIE" \
  -H 'Content-Type: application/json' \
  -d '{"currency":"USD"}' | jq

# PATCH timezone inválido (debería 400)
curl -s -X PATCH http://localhost:3000/v1/restaurants/settings \
  -H "Cookie: access_token=$COOKIE" \
  -H 'Content-Type: application/json' \
  -d '{"timezone":"America/New_York"}' -w '\nHTTP %{http_code}\n'
```

Expected:
- GET retorna shape extendido con `name`, `slug`, `country`, etc.
- PATCH currency retorna 200 con `currency: "USD"`.
- PATCH timezone foráneo retorna 400 con `code: "TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY"`.

- [ ] **Step 3: Smoke test UI**

Abrir `http://localhost:4321/dash/settings` en navegador, loguear como ADMIN del create-dummy. Verificar:
- Form se popula con name, slug, country (disabled), timezone dropdown, currency, decimal radio.
- Cambiar moneda → guardar → toast verde.
- Cambiar nombre → guardar → slug visible se actualiza.
- Cambiar decimalSeparator a `.` → guardar → en `/dash/orders` "Nuevo pedido", precios mostrados con `1,234.56`.

- [ ] **Step 4: Correr toda la suite del backend dentro del contenedor**

```bash
docker compose exec -T res-api-core pnpm test
docker compose exec -T res-api-core pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 5 (opcional): commit final de cualquier ajuste manual**

```bash
git status
# si hay cambios:
git add -A
git commit -m "chore(restaurants): tweaks after manual smoke verification"
```

---

## Self-review (autor del plan)

- **Spec coverage:**
  - `name`, `timezone`, `currency`, `decimalSeparator` editables → Tasks 5, 8, 9, 11.
  - `country` read-only en respuesta → Tasks 6, 9.
  - `thousandsSeparator` derivado en backend → Task 8 (steps 7, 11).
  - `timezone ∈ country.timezones` → Task 8 (steps 5–6, 11).
  - `currency` ISO 4217 → Task 4 + Task 11.
  - Slug regen al cambiar name → Task 8 (step 8, 11).
  - Cache invalidation timezone → Task 8 (steps 5–6).
  - PATCH ADMIN only + multi-tenant → Tasks 9, 11.
  - Eliminar PATCH /name + RenameDto + rename.e2e-spec → Task 10.
  - Module info actualizado → Task 12.
  - UI: lib type + dash/settings.astro reemplazado → Tasks 13, 14.
  - Excepción nueva `RestaurantNotFoundException` (no estaba en spec, pero el service la requiere) → Task 2.

- **Type consistency:** `updateSettings(restaurantId, dto)` y `updateWithSettings(restaurantId, { restaurant, settings })` consistentes en Tasks 7 y 8. `RestaurantSettingsDto` extendido en Task 6 y consumido por controller en Task 9 con los mismos campos.

- **Placeholders:** ninguno detectado.

---

## Execution Handoff

Plan completo y guardado en `apps/api-core/docs/superpowers/plans/2026-05-31-restaurant-settings-update.md`.

**Opciones de ejecución:**

1. **Subagent-Driven (recomendado)** — Dispatch de un subagente fresco por task con revisión entre tasks, iteración rápida.
2. **Inline Execution** — Ejecutar tasks en esta sesión con `executing-plans`, batch con checkpoints.

¿Qué approach prefieres?
