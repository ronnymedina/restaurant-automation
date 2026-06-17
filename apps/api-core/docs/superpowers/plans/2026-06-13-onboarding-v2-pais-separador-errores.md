# Onboarding v2: país/separador/timezone + contrato de errores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El onboarding captura país (lista LatAm), separador decimal (override) y timezone; deriva moneda y thousands; y toda la API unifica su contrato de error (`message: string[]`, `code`, `statusCode`).

**Architecture:** Dos fases. **Fase 1 (fundacional):** contrato de error unificado — `BaseException` emite `message` como array y un `exceptionFactory` global agrega `code` a los 400 de validación. **Fase 2:** feature de onboarding — tabla LatAm como fuente única (endpoint público), DTO con país/separador, derivación en el service y captura en el wizard. **Fase 3:** documentación (catálogo `.md`, ADR 0007, Swagger, CLAUDE.md).

**Tech Stack:** NestJS + Prisma (api-core), Jest + Supertest (e2e), Astro + React + Vitest + Testing Library (ui), `countries-and-timezones`.

**Spec:** `apps/api-core/docs/superpowers/specs/2026-06-13-onboarding-pais-separador-y-contrato-errores-design.md`

**Convenciones del repo (recordatorio):**
- Tests del backend **siempre dentro del contenedor**: `docker compose exec res-api-core pnpm test` (unit) y `docker compose exec res-api-core pnpm test:e2e` (e2e).
- Tests de UI: `res-ui` **no tiene pnpm en `exec -T`**; usar `docker compose exec -T res-ui node_modules/.bin/vitest run <ruta>`.
- Multipart POST al onboarding requieren header `Origin` (guard CSRF).
- Cero `any` (ESLint lo enforce). Tipos explícitos en todo el código nuevo.

---

## FASE 1 — Contrato de error unificado

### Task 1: `BaseException` emite `message` como array

**Files:**
- Modify: `apps/api-core/src/common/exceptions/base.exception.ts`
- Test: `apps/api-core/src/common/exceptions/base.exception.spec.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api-core/src/common/exceptions/base.exception.spec.ts`:

```ts
import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

describe('BaseException', () => {
  it('expone message como array de un elemento en el body de respuesta', () => {
    const ex = new BaseException('Something failed', HttpStatus.CONFLICT, 'SOMETHING_FAILED', { id: '1' });
    const body = ex.getResponse() as Record<string, unknown>;

    expect(body.message).toEqual(['Something failed']);
    expect(body.code).toBe('SOMETHING_FAILED');
    expect(body.statusCode).toBe(HttpStatus.CONFLICT);
    expect(body.details).toEqual({ id: '1' });
  });

  it('mantiene getStatus() igual al statusCode', () => {
    const ex = new BaseException('x', HttpStatus.BAD_REQUEST, 'X');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec res-api-core pnpm test -- base.exception.spec`
Expected: FAIL — `body.message` es el string `'Something failed'`, no `['Something failed']`.

- [ ] **Step 3: Implementar el cambio mínimo**

En `apps/api-core/src/common/exceptions/base.exception.ts`, envolver `message` en un array dentro del objeto pasado a `super()`:

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception class for all custom exceptions.
 * Provides a consistent error response structure across the application.
 *
 * Contrato de error unificado (ver ADR 0007):
 *   { message: string[], code: string, statusCode: number, details?: object }
 * `message` es SIEMPRE un array (aquí, de un elemento) para igualar la forma
 * de los errores de validación, que devuelven varios mensajes.
 */
export class BaseException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(
      {
        message: [message],
        code,
        details,
        statusCode,
      },
      statusCode,
    );
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec res-api-core pnpm test -- base.exception.spec`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/common/exceptions/base.exception.ts apps/api-core/src/common/exceptions/base.exception.spec.ts
git commit -m "feat(errors): BaseException emite message como array (contrato unificado)"
```

---

### Task 2: Ajustar e2e que asertan `message` como string

**Files:**
- Modify: `apps/api-core/test/products.e2e-spec.ts:288`

> Único assert de error que se rompe con Task 1 (verificado por grep). Los 3 de
> `test/auth/recover.e2e-spec.ts` son la respuesta de éxito del controller, no un error → no se tocan.

- [ ] **Step 1: Correr la suite e2e para confirmar la rotura**

Run: `docker compose exec res-api-core pnpm test:e2e -- products.e2e-spec`
Expected: FAIL en el caso que asierta `res.body.message` === 'Category not found'.

- [ ] **Step 2: Ajustar el assert**

En `apps/api-core/test/products.e2e-spec.ts`, línea ~288, cambiar:

```ts
expect(res.body.message).toBe('Category not found');
```
por:
```ts
expect(res.body.message).toEqual(['Category not found']);
```

- [ ] **Step 3: Correr y verificar verde**

Run: `docker compose exec res-api-core pnpm test:e2e -- products.e2e-spec`
Expected: PASS.

- [ ] **Step 4: Barrido de regresión completo de e2e**

Run: `docker compose exec res-api-core pnpm test:e2e`
Expected: PASS. Si algún otro caso compara `body.message` de un error como string, ajustarlo a array del mismo modo (`toEqual([...])` o `res.body.message[0]`).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/test/products.e2e-spec.ts
git commit -m "test(errors): ajustar asserts de message a array tras contrato unificado"
```

---

### Task 3: `exceptionFactory` global agrega `code` a los 400 de validación

**Files:**
- Modify: `apps/api-core/src/main.ts:32-38`
- Test: `apps/api-core/test/validation-contract.e2e-spec.ts` (crear)

- [ ] **Step 1: Escribir el test e2e que falla**

Crear `apps/api-core/test/validation-contract.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Replica exacta del exceptionFactory de main.ts (mantener en sync).
function validationExceptionFactory(errors: import('class-validator').ValidationError[]) {
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
  return new BadRequestException({ message: messages, code: 'VALIDATION_ERROR', statusCode: 400 });
}

describe('Contrato de error de validación (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.enableVersioning({ type: (await import('@nestjs/common')).VersioningType.URI });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('400 de validación trae code VALIDATION_ERROR, message:string[] y sin campo "error"', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .set('Origin', 'http://localhost:4321')
      .field('restaurantName', 'Mi Restaurante')
      .field('email', 'no-es-un-email')
      .field('timezone', 'UTC')
      .field('country', 'CL')
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body.message.length).toBeGreaterThan(0);
    expect(res.body.error).toBeUndefined();
  });
});
```

> Nota: este test instancia su propia app para no depender de helpers de bootstrap. Si el repo
> tiene un helper de e2e (`createTestApp`), preferir reutilizarlo y solo añadir el `exceptionFactory`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec res-api-core pnpm test:e2e -- validation-contract`
Expected: FAIL si la app de prueba no aplica el factory; o demuestra el contrato esperado. (El objetivo real es el cambio en `main.ts` del Step 3, que este test documenta.)

- [ ] **Step 3: Implementar el `exceptionFactory` en `main.ts`**

En `apps/api-core/src/main.ts`, reemplazar el `useGlobalPipes`:

```ts
import { ValidationPipe, VersioningType, BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

// ...

app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    // Contrato de error unificado (ADR 0007): los 400 de validación
    // emiten { message: string[], code, statusCode } — alineado con BaseException.
    exceptionFactory: (errors: ValidationError[]) => {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      return new BadRequestException({
        message: messages,
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    },
  }),
);
```

- [ ] **Step 4: Verificar contra el backend real**

Run:
```bash
docker compose up -d res-api-core
curl -s -X POST http://localhost:3000/v1/onboarding/register \
  -H 'Origin: http://localhost:4321' \
  -F 'restaurantName=Mi Restaurante' -F 'email=no-es-un-email' -F 'timezone=UTC' -F 'country=CL'
```
Expected: body `{"message":["..."],"code":"VALIDATION_ERROR","statusCode":400}` (sin `"error"`).

- [ ] **Step 5: Correr e2e y commit**

Run: `docker compose exec res-api-core pnpm test:e2e -- validation-contract`
Expected: PASS.

```bash
git add apps/api-core/src/main.ts apps/api-core/test/validation-contract.e2e-spec.ts
git commit -m "feat(errors): exceptionFactory global agrega code VALIDATION_ERROR a los 400"
```

---

## FASE 2 — Onboarding: país, separador, timezone

### Task 4: Tabla LatAm (fuente única)

**Files:**
- Create: `apps/api-core/src/onboarding/data/latam-countries.ts`
- Test: `apps/api-core/src/onboarding/data/latam-countries.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api-core/src/onboarding/data/latam-countries.spec.ts`:

```ts
import {
  LATAM_COUNTRIES,
  LATAM_COUNTRY_CODES,
  findLatamCountry,
} from './latam-countries';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ct: { getCountry: (id: string) => { timezones: string[] } | null } = require('countries-and-timezones');

describe('LATAM_COUNTRIES', () => {
  it('tiene códigos únicos en ISO alpha-2', () => {
    const codes = LATAM_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z]{2}$/));
  });

  it('cada primaryTimezone pertenece a los timezones del país', () => {
    for (const country of LATAM_COUNTRIES) {
      const tzs = ct.getCountry(country.code)?.timezones ?? [];
      expect(tzs).toContain(country.primaryTimezone);
    }
  });

  it('decimalSeparator es "." o ","', () => {
    LATAM_COUNTRIES.forEach((c) => expect(['.', ',']).toContain(c.decimalSeparator));
  });

  it('LATAM_COUNTRY_CODES refleja todos los códigos', () => {
    expect(LATAM_COUNTRY_CODES).toEqual(LATAM_COUNTRIES.map((c) => c.code));
  });

  it('findLatamCountry devuelve el país o undefined', () => {
    expect(findLatamCountry('CL')?.currency).toBe('CLP');
    expect(findLatamCountry('XX')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec res-api-core pnpm test -- latam-countries.spec`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Crear el módulo de datos**

Crear `apps/api-core/src/onboarding/data/latam-countries.ts` con el contenido EXACTO de la sección A.1 del spec (interface `LatamCountry` con `code/name/currency/decimalSeparator/primaryTimezone`, el array `LATAM_COUNTRIES` de 19 países, `LATAM_COUNTRY_CODES` y `findLatamCountry`).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec res-api-core pnpm test -- latam-countries.spec`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/onboarding/data/latam-countries.ts apps/api-core/src/onboarding/data/latam-countries.spec.ts
git commit -m "feat(onboarding): tabla curada de países LatAm como fuente única"
```

---

### Task 5: Endpoint público `GET /v1/onboarding/countries`

**Files:**
- Create: `apps/api-core/src/onboarding/serializers/country-option.serializer.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.controller.ts`
- Test: `apps/api-core/test/onboarding/countries.e2e-spec.ts`

- [ ] **Step 1: Escribir el test e2e que falla**

Crear `apps/api-core/test/onboarding/countries.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('GET /v1/onboarding/countries (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createApplication();
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
  });

  afterAll(async () => app.close());

  it('devuelve la lista LatAm ordenada por name con los campos esperados', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/onboarding/countries')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(19);

    const cl = res.body.find((c: { code: string }) => c.code === 'CL');
    expect(cl).toEqual({
      code: 'CL',
      name: 'Chile',
      currency: 'CLP',
      defaultDecimalSeparator: ',',
    });

    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec res-api-core pnpm test:e2e -- onboarding/countries`
Expected: FAIL — ruta 404.

- [ ] **Step 3: Crear el serializer**

Crear `apps/api-core/src/onboarding/serializers/country-option.serializer.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class CountryOptionSerializer {
  @ApiProperty({ example: 'CL', description: 'ISO 3166-1 alpha-2' })
  code: string;

  @ApiProperty({ example: 'Chile', description: 'Nombre del país en español' })
  name: string;

  @ApiProperty({ example: 'CLP', description: 'Código ISO 4217 — solo etiqueta de display' })
  currency: string;

  @ApiProperty({ example: ',', enum: ['.', ','], description: 'Separador decimal por defecto del país' })
  defaultDecimalSeparator: '.' | ',';
}
```

- [ ] **Step 4: Agregar el endpoint al controller**

En `apps/api-core/src/onboarding/onboarding.controller.ts`, importar y agregar el método (junto a los imports existentes de `Get`, `LATAM_COUNTRIES`, serializer):

```ts
import { Controller, Get, Post, /* ...existentes... */ } from '@nestjs/common';
import { LATAM_COUNTRIES } from './data/latam-countries';
import { CountryOptionSerializer } from './serializers/country-option.serializer';

// dentro de la clase OnboardingController:
@Public()
@Get('countries')
@ApiOperation({
  summary: 'Listar países soportados (LatAm)',
  description: 'Lista curada de países con su moneda y separador decimal por defecto, para el wizard de onboarding.',
})
@ApiResponse({ status: 200, description: 'Lista de países', type: CountryOptionSerializer, isArray: true })
getCountries(): CountryOptionSerializer[] {
  return [...LATAM_COUNTRIES]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((c) => ({
      code: c.code,
      name: c.name,
      currency: c.currency,
      defaultDecimalSeparator: c.decimalSeparator,
    }));
}
```

- [ ] **Step 5: Correr y verificar verde + commit**

Run: `docker compose exec res-api-core pnpm test:e2e -- onboarding/countries`
Expected: PASS.

```bash
git add apps/api-core/src/onboarding/serializers/country-option.serializer.ts apps/api-core/src/onboarding/onboarding.controller.ts apps/api-core/test/onboarding/countries.e2e-spec.ts
git commit -m "feat(onboarding): endpoint público GET /v1/onboarding/countries"
```

---

### Task 6: DTO — `country` requerido, `decimalSeparator` opcional, mensajes en inglés

**Files:**
- Modify: `apps/api-core/src/onboarding/dto/onboarding-register.dto.ts`
- Modify: `apps/api-core/test/onboarding/register-validation.e2e-spec.ts`

- [ ] **Step 1: Escribir los casos e2e nuevos (fallan)**

En `apps/api-core/test/onboarding/register-validation.e2e-spec.ts`, agregar (todas las requests con `.set('Origin', 'http://localhost:4321')`):

```ts
it('400 — country ausente', async () => {
  const res = await request(app.getHttpServer())
    .post('/v1/onboarding/register')
    .set('Origin', 'http://localhost:4321')
    .field('email', 'owner@test.com')
    .field('restaurantName', 'Mi Restaurante')
    .field('timezone', 'UTC')
    .expect(400);
  expect(res.body.code).toBe('VALIDATION_ERROR');
});

it('400 — country fuera de la lista LatAm', async () => {
  await request(app.getHttpServer())
    .post('/v1/onboarding/register')
    .set('Origin', 'http://localhost:4321')
    .field('email', 'owner@test.com')
    .field('restaurantName', 'Mi Restaurante')
    .field('timezone', 'UTC')
    .field('country', 'US')
    .expect(400);
});

it('400 — decimalSeparator inválido', async () => {
  await request(app.getHttpServer())
    .post('/v1/onboarding/register')
    .set('Origin', 'http://localhost:4321')
    .field('email', 'owner@test.com')
    .field('restaurantName', 'Mi Restaurante')
    .field('timezone', 'UTC')
    .field('country', 'CL')
    .field('decimalSeparator', ';')
    .expect(400);
});
```

> Nota: revisar el `beforeAll` del archivo — si la app de test no aplica el `exceptionFactory`,
> añadirlo igual que en `main.ts` para que `res.body.code` exista. Los casos preexistentes que
> agregaban `country` deberán incluir `.field('country', 'CL')` para no fallar por country ausente
> cuando lo que se prueba es otra cosa.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec res-api-core pnpm test:e2e -- onboarding/register-validation`
Expected: FAIL — hoy `country`/`decimalSeparator` no se validan.

- [ ] **Step 3: Actualizar el DTO**

En `apps/api-core/src/onboarding/dto/onboarding-register.dto.ts`:
- Importar `IsIn` de `class-validator` y `LATAM_COUNTRY_CODES` de `../data/latam-countries`.
- Migrar los mensajes existentes a inglés.
- Agregar `country` y `decimalSeparator`.

```ts
import {
  Allow, IsString, IsBoolean, IsOptional, IsNotEmpty, IsEmail, Matches, MaxLength, IsTimeZone, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { LATAM_COUNTRY_CODES } from '../data/latam-countries';

export class OnboardingRegisterDto {
  @ApiProperty({ description: 'User email', example: 'usuario@restaurante.com' })
  @IsEmail({}, { message: 'email must be valid' })
  @IsNotEmpty({ message: 'email is required' })
  email: string;

  @ApiProperty({
    description: 'Restaurant name. Letters, accents, spaces, hyphen and underscore only. Max 60 chars.',
    example: 'Mi Restaurante',
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty({ message: 'restaurantName is required' })
  @MaxLength(60, { message: 'restaurantName must not exceed 60 characters' })
  @Matches(/^[a-zA-ZÀ-ÿ \-_]+$/, {
    message: 'restaurantName may only contain letters, accents, spaces, hyphen and underscore',
  })
  restaurantName: string;

  @ApiProperty({ description: 'IANA timezone of the restaurant, from the browser.', example: 'America/Santiago' })
  @IsTimeZone({ message: 'timezone must be a valid IANA timezone' })
  @IsNotEmpty({ message: 'timezone is required' })
  timezone: string;

  @ApiProperty({ description: 'Supported LATAM country (ISO 3166-1 alpha-2).', example: 'CL' })
  @IsIn(LATAM_COUNTRY_CODES, { message: 'country must be a supported LATAM ISO code' })
  @IsNotEmpty({ message: 'country is required' })
  country: string;

  @ApiPropertyOptional({
    description: 'Decimal separator. Defaults to the country convention if omitted.',
    enum: ['.', ','],
    example: ',',
  })
  @IsOptional()
  @IsIn(['.', ','], { message: 'decimalSeparator must be "." or ","' })
  decimalSeparator?: '.' | ',';

  @ApiPropertyOptional({
    description: 'If true, creates 5 demo products with a sample menu',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  createDemoData?: boolean;

  // Whitelisted to prevent 400 when multipart sends photo as a text field.
  @IsOptional()
  @Allow()
  photo?: unknown;
}
```
(El bloque `OnboardingPhotosDto` / `OnboardingRegisterSwaggerDto` queda igual.)

- [ ] **Step 4: Correr y verificar verde**

Run: `docker compose exec res-api-core pnpm test:e2e -- onboarding/register-validation`
Expected: PASS (casos nuevos + preexistentes ajustados). Si algún preexistente comparaba texto de mensaje en español, actualizarlo al inglés nuevo.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/onboarding/dto/onboarding-register.dto.ts apps/api-core/test/onboarding/register-validation.e2e-spec.ts
git commit -m "feat(onboarding): DTO valida country y decimalSeparator; mensajes en inglés"
```

---

### Task 7: `createRestaurant` a objeto de opciones + persistencia de settings

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurants.service.ts:23-26`
- Modify: `apps/api-core/src/restaurants/restaurant.repository.ts:31-47`
- Modify: `apps/api-core/src/cli/commands/create-restaurant.command.ts:27`
- Modify: `apps/api-core/src/cli/commands/create-dummy.command.ts:55`
- Test: `apps/api-core/src/restaurants/restaurants.service.spec.ts` (crear o extender)

- [ ] **Step 1: Escribir el test unitario que falla**

Crear/extender `apps/api-core/src/restaurants/restaurants.service.spec.ts` con un caso que verifique que `createRestaurant` pasa al repo los campos derivados y normaliza el timezone:

```ts
import { Test } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { TimezoneService } from './timezone.service';

describe('RestaurantsService.createRestaurant', () => {
  let service: RestaurantsService;
  const repo = {
    createWithSettings: jest.fn().mockResolvedValue({ id: 'r1' }),
    findBySlug: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: RestaurantRepository, useValue: repo },
        { provide: TimezoneService, useValue: { invalidate: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(RestaurantsService);
  });

  it('persiste country, currency y separadores; respeta el timezone si pertenece al país', async () => {
    await service.createRestaurant({
      name: 'Tacos',
      country: 'MX',
      currency: 'MXN',
      decimalSeparator: '.',
      thousandsSeparator: ',',
      timezone: 'America/Mexico_City',
    });

    expect(repo.createWithSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Tacos',
        country: 'MX',
        currency: 'MXN',
        decimalSeparator: '.',
        thousandsSeparator: ',',
        timezone: 'America/Mexico_City',
      }),
      undefined,
    );
  });

  it('cae al primaryTimezone implícito del país si el timezone no pertenece (vía caller)', async () => {
    // La normalización vive en OnboardingService (Task 8); aquí createRestaurant
    // persiste lo que recibe. Este test fija el contrato: lo recibido se persiste tal cual.
    await service.createRestaurant({
      name: 'X', country: 'CL', currency: 'CLP',
      decimalSeparator: ',', thousandsSeparator: '.', timezone: 'America/Santiago',
    });
    expect(repo.createWithSettings).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'America/Santiago', country: 'CL' }),
      undefined,
    );
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec res-api-core pnpm test -- restaurants.service.spec`
Expected: FAIL — `createRestaurant` aún acepta `(name, timezone)` posicional.

- [ ] **Step 3: Cambiar la firma del service**

En `apps/api-core/src/restaurants/restaurants.service.ts`:

```ts
export interface CreateRestaurantInput {
  name: string;
  timezone?: string;
  country?: string;
  currency?: string;
  decimalSeparator?: string;
  thousandsSeparator?: string;
}

async createRestaurant(input: CreateRestaurantInput, tx?: TransactionClient): Promise<Restaurant> {
  const slug = await this.generateSlug(input.name, tx);
  return this.restaurantRepository.createWithSettings(
    {
      name: input.name,
      slug,
      timezone: input.timezone ?? 'UTC',
      country: input.country,
      currency: input.currency,
      decimalSeparator: input.decimalSeparator,
      thousandsSeparator: input.thousandsSeparator,
    },
    tx,
  );
}
```

- [ ] **Step 4: Extender `createWithSettings` en el repo**

En `apps/api-core/src/restaurants/restaurant.repository.ts`:

```ts
async createWithSettings(
  data: {
    name: string; slug: string; timezone: string;
    country?: string; currency?: string;
    decimalSeparator?: string; thousandsSeparator?: string;
  },
  tx?: TransactionClient,
): Promise<Restaurant> {
  const run = async (client: TransactionClient) => {
    const restaurant = await client.restaurant.create({
      data: { name: data.name, slug: data.slug },
    });
    await client.restaurantSettings.create({
      data: {
        restaurantId: restaurant.id,
        timezone: data.timezone,
        // Campos opcionales: si vienen undefined, Prisma aplica el default del schema.
        ...(data.country ? { country: data.country } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.decimalSeparator ? { decimalSeparator: data.decimalSeparator } : {}),
        ...(data.thousandsSeparator ? { thousandsSeparator: data.thousandsSeparator } : {}),
      },
    });
    return restaurant;
  };
  if (tx) return run(tx);
  return this.prisma.$transaction(run);
}
```

- [ ] **Step 5: Actualizar los 2 callers de CLI**

En `apps/api-core/src/cli/commands/create-restaurant.command.ts` (~línea 27) y `create-dummy.command.ts` (~línea 55), cambiar la llamada posicional al objeto:

```ts
// create-restaurant.command.ts
const restaurant = await this.restaurantsService.createRestaurant({ name /*, timezone si aplica */ });

// create-dummy.command.ts
const restaurant = await this.restaurantsService.createRestaurant({
  name: DUMMY_RESTAURANT_NAME,
  timezone: DUMMY_TIMEZONE,
});
```

- [ ] **Step 6: Correr unit + lint y commit**

Run: `docker compose exec res-api-core pnpm test -- restaurants.service.spec`
Expected: PASS.
Run: `docker compose exec res-api-core pnpm lint`
Expected: sin errores (cero `any`).

```bash
git add apps/api-core/src/restaurants/restaurants.service.ts apps/api-core/src/restaurants/restaurant.repository.ts apps/api-core/src/cli/commands/create-restaurant.command.ts apps/api-core/src/cli/commands/create-dummy.command.ts apps/api-core/src/restaurants/restaurants.service.spec.ts
git commit -m "feat(restaurants): createRestaurant acepta país/moneda/separadores y los persiste"
```

---

### Task 8: `OnboardingService` deriva moneda/separadores y normaliza timezone

**Files:**
- Modify: `apps/api-core/src/onboarding/onboarding.service.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.controller.ts` (pasar nuevos campos)
- Modify: `apps/api-core/src/onboarding/onboarding.service.spec.ts`

- [ ] **Step 1: Escribir los tests unitarios que fallan**

En `apps/api-core/src/onboarding/onboarding.service.spec.ts`, ajustar el bloque `timezone` y agregar derivación. Reemplazar los dos tests del `describe('timezone')` (que hoy esperan firma posicional) por:

```ts
describe('localización (país, moneda, separadores, timezone)', () => {
  it('deriva currency y separadores desde el país y respeta el timezone válido', async () => {
    await service.registerRestaurant({
      email: 'new@test.com',
      restaurantName: 'Test',
      country: 'MX',
      timezone: 'America/Mexico_City',
    });

    expect(mockRestaurantsService.createRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test',
        country: 'MX',
        currency: 'MXN',
        decimalSeparator: '.',
        thousandsSeparator: ',',
        timezone: 'America/Mexico_City',
      }),
      expect.anything(),
    );
  });

  it('respeta el override de decimalSeparator (y deriva thousands)', async () => {
    await service.registerRestaurant({
      email: 'new@test.com', restaurantName: 'Test', country: 'CL',
      timezone: 'America/Santiago', decimalSeparator: '.',
    });
    expect(mockRestaurantsService.createRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ decimalSeparator: '.', thousandsSeparator: ',' }),
      expect.anything(),
    );
  });

  it('cae al primaryTimezone del país si el timezone no pertenece', async () => {
    await service.registerRestaurant({
      email: 'new@test.com', restaurantName: 'Test', country: 'CL',
      timezone: 'America/Mexico_City', // no es de CL
    });
    expect(mockRestaurantsService.createRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'America/Santiago' }),
      expect.anything(),
    );
  });
});
```

> Importante: actualizar el mock `mockRestaurantsService.createRestaurant` y todas las llamadas
> existentes a `registerRestaurant({...})` del archivo para incluir `country: 'CL'` (ahora es
> requerido en `OnboardingInput`). Los asserts viejos `toHaveBeenCalledWith('Test', tz, ...)`
> (firma posicional) ya no aplican — fueron reemplazados arriba.

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec res-api-core pnpm test -- onboarding.service.spec`
Expected: FAIL.

- [ ] **Step 3: Implementar la derivación en el service**

En `apps/api-core/src/onboarding/onboarding.service.ts`:
- Agregar a `OnboardingInput`: `country: string;` y `decimalSeparator?: '.' | ',';`.
- Importar `findLatamCountry` y `countries-and-timezones`.
- Reemplazar la creación del restaurante en `setupCoreEntities`/`createRestaurant`:

```ts
import { findLatamCountry } from './data/latam-countries';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ct: { getCountry: (id: string) => { timezones: string[] } | null } = require('countries-and-timezones');

// OnboardingInput:
export interface OnboardingInput {
  email: string;
  restaurantName: string;
  country: string;
  timezone?: string;
  decimalSeparator?: '.' | ',';
  createDemoData?: boolean;
  photo?: { buffer: Buffer; mimeType: string };
}

// helper privado:
private resolveLocalization(input: OnboardingInput): {
  country: string; currency: string; decimalSeparator: string; thousandsSeparator: string; timezone: string;
} {
  const country = findLatamCountry(input.country);
  if (!country) {
    // El DTO ya valida @IsIn, pero defendemos el invariante.
    throw new OnboardingFailedException(`Unsupported country: ${input.country}`);
  }
  const decimalSeparator = input.decimalSeparator ?? country.decimalSeparator;
  const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';

  const countryTimezones = ct.getCountry(country.code)?.timezones ?? [];
  const timezone =
    input.timezone && countryTimezones.includes(input.timezone)
      ? input.timezone
      : country.primaryTimezone;

  return { country: country.code, currency: country.currency, decimalSeparator, thousandsSeparator, timezone };
}
```

Y en `createRestaurant` (el privado del service) pasar el objeto resuelto:

```ts
private async createRestaurant(input: OnboardingInput, tx: TransactionClient): Promise<Restaurant> {
  const loc = this.resolveLocalization(input);
  try {
    return await this.restaurantsService.createRestaurant({ name: input.restaurantName, ...loc }, tx);
  } catch (error) {
    throw new RestaurantCreationFailedException({ restaurantName: input.restaurantName });
  }
}
```
(Ajustar la llamada en `setupCoreEntities` para pasar `input` completo en vez de `(restaurantName, timezone, tx)`.)

- [ ] **Step 4: Pasar los campos desde el controller**

En `apps/api-core/src/onboarding/onboarding.controller.ts`, en `register(...)`:

```ts
const result = await this.onboardingService.registerRestaurant({
  email: body.email,
  restaurantName: body.restaurantName,
  country: body.country,
  timezone: body.timezone,
  decimalSeparator: body.decimalSeparator,
  createDemoData: body.createDemoData,
  photo,
});
```

- [ ] **Step 5: Correr unit + e2e + lint**

Run: `docker compose exec res-api-core pnpm test -- onboarding.service.spec`
Expected: PASS.
Run: `docker compose exec res-api-core pnpm test:e2e -- onboarding`
Expected: PASS (ajustar e2e de `register-conflicts`/`register-file` que envíen el body sin `country` → agregar `.field('country', 'CL')`).
Run: `docker compose exec res-api-core pnpm lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.service.ts apps/api-core/src/onboarding/onboarding.controller.ts apps/api-core/src/onboarding/onboarding.service.spec.ts apps/api-core/test/onboarding
git commit -m "feat(onboarding): deriva moneda/separadores del país y normaliza timezone"
```

---

### Task 9: Wizard `Step1Form` — selector de país + separador

**Files:**
- Modify: `apps/ui/src/components/onboarding/Step1Form.tsx`
- Modify: `apps/ui/src/components/onboarding/Step1Form.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

En `apps/ui/src/components/onboarding/Step1Form.test.tsx`, agregar (mockeando el fetch de países):

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, it, expect } from 'vitest';
import Step1Form from './Step1Form';

const countries = [
  { code: 'AR', name: 'Argentina', currency: 'ARS', defaultDecimalSeparator: ',' },
  { code: 'MX', name: 'México', currency: 'MXN', defaultDecimalSeparator: '.' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => countries })) as unknown as typeof fetch);
});

it('renderiza el selector de país con las opciones del endpoint', async () => {
  render(<Step1Form onSubmit={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText(/país/i)).toBeInTheDocument());
  expect(screen.getByRole('option', { name: 'Argentina' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'México' })).toBeInTheDocument();
});

it('preselecciona el separador por defecto del país elegido (overridable)', async () => {
  render(<Step1Form onSubmit={() => {}} />);
  await waitFor(() => screen.getByLabelText(/país/i));
  fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'MX' } });
  await waitFor(() =>
    expect((screen.getByLabelText(/punto decimal/i) as HTMLInputElement).checked).toBe(true),
  );
});

it('envía country y decimalSeparator en onSubmit', async () => {
  const onSubmit = vi.fn();
  render(<Step1Form onSubmit={onSubmit} />);
  await waitFor(() => screen.getByLabelText(/país/i));
  fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Mi Restaurante' } });
  fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'AR' } });
  fireEvent.submit(screen.getByRole('button', { name: /siguiente/i }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'a@b.com', restaurantName: 'Mi Restaurante', country: 'AR', decimalSeparator: ',' }),
  );
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/Step1Form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar país + separador en `Step1Form`**

Modificar `apps/ui/src/components/onboarding/Step1Form.tsx`:
- Cambiar la firma de `onSubmit` a `(data: { email: string; restaurantName: string; country: string; decimalSeparator: '.' | ',' }) => void`.
- Estado: `country`, `decimalSeparator`, `countries` (lista), carga vía `useEffect` con `fetch(`${config.apiUrl}/v1/onboarding/countries`)`.
- Al cambiar país, setear `decimalSeparator` al `defaultDecimalSeparator` del país (el usuario puede cambiarlo después con los radios).
- Agregar `<select id="country" aria-label="País">` y un fieldset de radios (reusar estilo de `RestaurantSettingsForm`):
  - `<label>` con texto que incluya "Coma decimal" (value `,`) y "Punto decimal" (value `.`), con `aria-label`/texto que matcheen los tests (`/coma decimal/i`, `/punto decimal/i`).
- Incluir `country` en la validación: el botón "Siguiente" se deshabilita si `country` está vacío.
- En `handleSubmit`, pasar `{ email, restaurantName, country, decimalSeparator }`.

> Importar `config` desde `../../config` para `apiUrl`. Manejar el estado de carga: mientras
> `countries` esté vacío, el select muestra una opción placeholder deshabilitada.

- [ ] **Step 4: Correr y verificar verde**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/Step1Form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/Step1Form.tsx apps/ui/src/components/onboarding/Step1Form.test.tsx
git commit -m "feat(ui/onboarding): Step1 selector de país y separador decimal"
```

---

### Task 10: `OnboardingWizard` — propaga country/decimalSeparator al backend

**Files:**
- Modify: `apps/ui/src/components/onboarding/OnboardingWizard.tsx`
- Modify: `apps/ui/src/components/onboarding/OnboardingWizard.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

En `apps/ui/src/components/onboarding/OnboardingWizard.test.tsx`, agregar un caso que verifique que el `FormData` del POST incluye `country` y `decimalSeparator`:

```tsx
it('incluye country y decimalSeparator en el FormData del registro', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith('/v1/onboarding/countries')) {
      return { ok: true, json: async () => [{ code: 'AR', name: 'Argentina', currency: 'ARS', defaultDecimalSeparator: ',' }] };
    }
    return { ok: true, json: async () => ({ productsCreated: 0 }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  // ...render wizard, completar Step1 (email, nombre, país AR), avanzar a Step2 y enviar "Usar datos demo"...

  const registerCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/v1/onboarding/register'));
  const body = registerCall?.[1]?.body as FormData;
  expect(body.get('country')).toBe('AR');
  expect(body.get('decimalSeparator')).toBe(',');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Propagar los campos en el wizard**

En `apps/ui/src/components/onboarding/OnboardingWizard.tsx`:
- Extender `Step1Data`: `{ email: string; restaurantName: string; country: string; decimalSeparator: '.' | ',' }`.
- En `handleStep2Submit`, agregar al `FormData`:
```ts
body.append('country', formData.country);
body.append('decimalSeparator', formData.decimalSeparator);
```

- [ ] **Step 4: Correr y verificar verde**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/OnboardingWizard.tsx apps/ui/src/components/onboarding/OnboardingWizard.test.tsx
git commit -m "feat(ui/onboarding): wizard propaga country y decimalSeparator al registro"
```

---

### Task 11: Frontend `error-messages.ts` — cubrir todos los codes

**Files:**
- Modify: `apps/ui/src/lib/error-messages.ts`
- Test: `apps/ui/src/lib/error-messages.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/ui/src/lib/error-messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './error-messages';

describe('getErrorMessage', () => {
  it('mapea los codes del onboarding a mensajes en español', () => {
    expect(getErrorMessage('VALIDATION_ERROR')).toMatch(/no son válidos|datos/i);
    expect(getErrorMessage('EMAIL_ALREADY_EXISTS')).toMatch(/registrado/i);
    expect(getErrorMessage('RESTAURANT_CREATION_FAILED')).toMatch(/registro|restaurante/i);
    expect(getErrorMessage('USER_CREATION_FAILED')).toMatch(/registro|cuenta/i);
    expect(getErrorMessage('DEFAULT_CATEGORY_CREATION_FAILED')).toMatch(/registro/i);
    expect(getErrorMessage('ONBOARDING_FAILED')).toMatch(/registro/i);
  });

  it('cae a un mensaje por defecto para codes desconocidos', () => {
    expect(getErrorMessage('UNKNOWN_CODE')).toMatch(/inesperado/i);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/lib/error-messages.test.ts`
Expected: FAIL (faltan codes).

- [ ] **Step 3: Agregar los codes faltantes**

En `apps/ui/src/lib/error-messages.ts`, agregar al `errorMessages`:

```ts
RESTAURANT_CREATION_FAILED: 'No se pudo completar el registro del restaurante. Intenta nuevamente.',
USER_CREATION_FAILED: 'No se pudo crear la cuenta. Intenta nuevamente.',
DEFAULT_CATEGORY_CREATION_FAILED: 'Hubo un problema al preparar tu restaurante. Intenta nuevamente.',
```

- [ ] **Step 4: Correr y verificar verde + commit**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/lib/error-messages.test.ts`
Expected: PASS.

```bash
git add apps/ui/src/lib/error-messages.ts apps/ui/src/lib/error-messages.test.ts
git commit -m "feat(ui): mapeo friendly de los codes de error del onboarding"
```

---

## FASE 3 — Documentación

### Task 12: Catálogo de errores `.md` (incluye email/reenvío)

**Files:**
- Create: `apps/api-core/docs/onboarding-error-mapping.md`
- Modify: `apps/api-core/docs/README.md`

- [ ] **Step 1: Crear el catálogo**

Crear `apps/api-core/docs/onboarding-error-mapping.md` con:
- Sección "Contrato de error" (forma `{ message: string[], code, statusCode, details? }`, ver ADR 0007).
- Tabla con todas las filas de la sección C.2 del spec: `code | HTTP | cuándo | shape de details | mensaje friendly ES`.
- Sección "Warnings 201": `products_extraction_failed`, `products_creation_failed` (no son errores; viajan en el body del 201).
- Sección "Email y reenvío": el onboarding responde 201 aunque el email falle (envío no bloqueante); el reenvío es `POST /v1/auth/recover { email }` (throttle 3/15min), ya cableado en `Step3Success`; **gap conocido**: `recoverAccount` traga fallas de envío y responde 200 genérico.

- [ ] **Step 2: Registrar en el índice**

Agregar una línea en `apps/api-core/docs/README.md` apuntando a `onboarding-error-mapping.md`.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/onboarding-error-mapping.md apps/api-core/docs/README.md
git commit -m "docs(onboarding): catálogo de errores y flujo de email/reenvío"
```

---

### Task 13: ADR 0007 — Contrato de error unificado

**Files:**
- Create: `apps/api-core/docs/adr/0007-contrato-de-error-unificado.md`
- Modify: `apps/api-core/docs/adr/README.md`

- [ ] **Step 1: Escribir el ADR (formato MADR en español)**

Crear `apps/api-core/docs/adr/0007-contrato-de-error-unificado.md` con las secciones obligatorias MADR (Estado: Aceptado, Fecha: 2026-06-13; Contexto: inconsistencia validación vs custom verificada empíricamente; Decisión: `{ message: string[], code, statusCode, details? }`, mensajes en inglés, friendly en frontend por `code`; Consecuencias positivas/negativas; Alternativas consideradas; Referencias a `onboarding-error-mapping.md` y `main.ts`/`base.exception.ts`).

- [ ] **Step 2: Registrar en el índice de ADRs**

Agregar la fila `| 0007 | [Contrato de error unificado de la API](./0007-contrato-de-error-unificado.md) | Aceptado | 2026-06-13 |` a la tabla "ADRs activos" de `apps/api-core/docs/adr/README.md`.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/adr/0007-contrato-de-error-unificado.md apps/api-core/docs/adr/README.md
git commit -m "docs(adr): ADR 0007 contrato de error unificado de la API"
```

---

### Task 14: CLAUDE.md — convenciones (sin `any`, errores documentados)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Agregar una sección concisa**

En `CLAUDE.md` (raíz), agregar una subsección breve bajo la guía de api-core:

```markdown
### Convenciones del backend

- **Sin `any`**: prohibido en todo el proyecto (ESLint `@typescript-eslint/no-explicit-any: error`). Usar `unknown` + narrowing cuando el tipo no se conozca.
- **Errores documentados**: toda excepción lleva comentario en su definición y `@ApiResponse` en Swagger con su `code`. El contrato de error sigue el **ADR 0007**: `{ message: string[], code, statusCode, details? }`. Mensajes técnicos en inglés; el texto friendly (ES) vive en el frontend (`apps/ui/src/lib/error-messages.ts`), mapeado por `code`. Catálogo en `apps/api-core/docs/onboarding-error-mapping.md`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: convenciones de backend (sin any, contrato de error ADR 0007)"
```

---

### Task 15: Swagger del controller + comentarios en excepciones

**Files:**
- Modify: `apps/api-core/src/onboarding/onboarding.controller.ts`
- Modify: `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts`

- [ ] **Step 1: Reforzar `@ApiResponse` en `register`**

En `apps/api-core/src/onboarding/onboarding.controller.ts`, actualizar las descripciones de `@ApiResponse` para nombrar los `code` y ejemplos del body unificado:
- 400 → `{ message: string[], code: 'VALIDATION_ERROR', statusCode: 400 }`
- 409 → `code: 'EMAIL_ALREADY_EXISTS'`
- 429 → throttle
- 500 → `code: 'ONBOARDING_FAILED' | 'RESTAURANT_CREATION_FAILED' | 'USER_CREATION_FAILED' | 'DEFAULT_CATEGORY_CREATION_FAILED'`

Usar `schema: { example: { ... } }` en cada `@ApiResponse` para que Swagger muestre la forma real.

- [ ] **Step 2: Comentario por excepción**

En `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts`, asegurar que cada clase tenga un comentario que incluya su `code` y HTTP (ya existen comentarios; completar con el `code` y status donde falte).

- [ ] **Step 3: Verificar Swagger**

Run: `docker compose up -d res-api-core` y abrir `http://localhost:3000/docs` → sección Onboarding. Confirmar que `register` y `countries` muestran los códigos/ejemplos.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.controller.ts apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts
git commit -m "docs(swagger): documentar codes de error del onboarding"
```

---

## Cierre

- [ ] **Suite completa backend (en contenedor)**

Run:
```bash
docker compose exec res-api-core pnpm test
docker compose exec res-api-core pnpm test:e2e
docker compose exec res-api-core pnpm lint
```
Expected: todo verde, cero `any`.

- [ ] **Suite UI (baseline conocido)**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding src/lib/error-messages.test.ts`
Expected: los nuevos tests pasan. (Recordar: hay ~13 fallas UI preexistentes en otras áreas, ajenas a este cambio.)

- [ ] **Verificación manual end-to-end**

Abrir el wizard, elegir país (ej. México), confirmar separador preseleccionado `.`, completar y registrar. Verificar en DB (`pnpm exec prisma studio`) que `RestaurantSettings` tenga `country=MX`, `currency=MXN`, `decimalSeparator='.'`, `thousandsSeparator=','`, `timezone` válido para MX.

- [ ] **PR contra `develop`** (no `main`) cuando el usuario lo pida.
