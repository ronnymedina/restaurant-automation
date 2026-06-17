# Spec — Onboarding v2: país/separador/timezone + contrato de errores unificado

**Fecha:** 2026-06-13
**Apps afectadas:** `apps/api-core`, `apps/ui`
**Estado:** Propuesto (pendiente de revisión del usuario)

---

## 1. Contexto y estado actual

El onboarding (`POST /v1/onboarding/register`, público, multipart, throttle 5/15min) hoy
crea restaurante + usuario + categoría default, envía email de activación (no bloqueante)
y opcionalmente crea productos (foto Gemini o demo).

**Limitaciones detectadas:**

1. **Localización fija.** `createRestaurant(name, timezone)` solo persiste `name`, `slug`,
   `timezone`. Todo restaurante nace con los defaults del schema: `country="CL"`,
   `currency="CLP"`, `decimalSeparator=","`, `thousandsSeparator="."`, sin importar dónde
   esté. El país nunca se captura ni se puede editar después. (El comentario de
   `RestaurantSettingsForm.tsx` ya asumía que `currency` se "deriva del país en onboarding",
   pero esa derivación nunca existió.)

2. **Contrato de error inconsistente.** Verificado empíricamente contra el backend en
   ejecución:
   - Excepciones custom (`BaseException`) → `{ message: string, code, statusCode, details? }`.
   - Validación de DTO (400) → forma default de Nest `{ message: string[], error: "Bad Request",
     statusCode }`, **sin `code`**. El `ValidationPipe` global (`main.ts`) no define
     `exceptionFactory`. Resultado: el frontend no puede mapear errores de validación por `code`.

3. **Falta de documentación de errores.** No hay un catálogo de códigos de error ni una
   convención escrita sobre tipos `any` o documentación de errores.

> Relacionado: **ADR 0004** "Presentación localizada por restaurante" ya define que
> `timezone`/`decimalSeparator`/`thousandsSeparator`/`currency` son configuración por
> `RestaurantSettings`. Este spec **implementa la captura** de esa configuración en el
> onboarding (el ADR 0004 describía el modelo, no el flujo de alta).

---

## 2. Objetivos

1. Capturar en el onboarding: **país** (lista curada LatAm), **separador decimal** (con
   override) y **timezone** — poblando `RestaurantSettings` de verdad en vez de usar defaults.
2. Derivar **moneda** desde el país (solo display) y **thousandsSeparator** desde el decimal.
3. Unificar el **contrato de error** de toda la API: `message` siempre `string[]`, `code`
   siempre presente, mensajes técnicos en inglés.
4. Garantizar **cero `any`** en el código nuevo y dejarlo como convención escrita.
5. **Documentar los errores**: comentarios en código, Swagger, un `.md` de mapeo y un **ADR**.
6. **Verificar y documentar** el flujo de falla de email + reenvío.

## 3. No-objetivos (YAGNI)

- Traducir el backend a múltiples idiomas (los mensajes quedan en inglés; el friendly en español
  lo arma el frontend por `code`).
- Selector de timezone visible en el wizard (se mantiene detectado del navegador).
- `details.errors` por campo en errores de validación (el `message[]` plano alcanza; se puede
  estructurar después sin cambio de backend).
- Cambiar la lógica de reenvío de email (solo se documenta el gap conocido).
- Países fuera de Latinoamérica (el sistema aún no está traducido al inglés).

---

## 4. Decisiones tomadas (resumen del brainstorming)

| Decisión | Resultado |
|---|---|
| Origen del separador | El usuario elige **país y separador** (país deriva defaults; separador overridable) |
| Moneda | **Derivada del país** automáticamente (solo etiqueta de display) |
| Fuente de la lista de países | **Endpoint backend** como fuente única (`GET /v1/onboarding/countries`) |
| Alcance de países | **Solo Latinoamérica** (sistema no traducido al inglés aún) |
| Timezone en el wizard | **Invisible** (navegador), con fallback al timezone primario del país |
| Errores de validación 400 | `exceptionFactory` global que agrega `code` |
| Forma de `message` | **Siempre `string[]`** (custom = array de 1 elemento) |
| Idioma de mensajes backend | **Inglés** por defecto; friendly español en el frontend por `code` |
| Falla de email | No bloqueante (201 igual); reenvío vía `/v1/auth/recover` (ya cableado); gap documentado |

---

## 5. Diseño detallado

### Parte A — País, separador y timezone

#### A.1 Tabla LatAm curada (backend, fuente única)

Nuevo módulo `apps/api-core/src/onboarding/data/latam-countries.ts`:

```ts
export interface LatamCountry {
  code: string;                 // ISO 3166-1 alpha-2 (ej. 'CL')
  name: string;                 // nombre en español (ej. 'Chile')
  currency: string;             // ISO 4217 (ej. 'CLP') — solo display
  decimalSeparator: '.' | ',';  // convención local por defecto
  primaryTimezone: string;      // IANA canónico (fallback si el del navegador no aplica)
}

export const LATAM_COUNTRIES: readonly LatamCountry[] = [
  { code: 'AR', name: 'Argentina',            currency: 'ARS', decimalSeparator: ',', primaryTimezone: 'America/Argentina/Buenos_Aires' },
  { code: 'BO', name: 'Bolivia',              currency: 'BOB', decimalSeparator: ',', primaryTimezone: 'America/La_Paz' },
  { code: 'BR', name: 'Brasil',               currency: 'BRL', decimalSeparator: ',', primaryTimezone: 'America/Sao_Paulo' },
  { code: 'CL', name: 'Chile',                currency: 'CLP', decimalSeparator: ',', primaryTimezone: 'America/Santiago' },
  { code: 'CO', name: 'Colombia',             currency: 'COP', decimalSeparator: ',', primaryTimezone: 'America/Bogota' },
  { code: 'CR', name: 'Costa Rica',           currency: 'CRC', decimalSeparator: ',', primaryTimezone: 'America/Costa_Rica' },
  { code: 'CU', name: 'Cuba',                 currency: 'CUP', decimalSeparator: '.', primaryTimezone: 'America/Havana' },
  { code: 'DO', name: 'República Dominicana', currency: 'DOP', decimalSeparator: '.', primaryTimezone: 'America/Santo_Domingo' },
  { code: 'EC', name: 'Ecuador',              currency: 'USD', decimalSeparator: '.', primaryTimezone: 'America/Guayaquil' },
  { code: 'GT', name: 'Guatemala',            currency: 'GTQ', decimalSeparator: '.', primaryTimezone: 'America/Guatemala' },
  { code: 'HN', name: 'Honduras',             currency: 'HNL', decimalSeparator: '.', primaryTimezone: 'America/Tegucigalpa' },
  { code: 'MX', name: 'México',               currency: 'MXN', decimalSeparator: '.', primaryTimezone: 'America/Mexico_City' },
  { code: 'NI', name: 'Nicaragua',            currency: 'NIO', decimalSeparator: '.', primaryTimezone: 'America/Managua' },
  { code: 'PA', name: 'Panamá',               currency: 'PAB', decimalSeparator: '.', primaryTimezone: 'America/Panama' },
  { code: 'PE', name: 'Perú',                 currency: 'PEN', decimalSeparator: '.', primaryTimezone: 'America/Lima' },
  { code: 'PY', name: 'Paraguay',             currency: 'PYG', decimalSeparator: ',', primaryTimezone: 'America/Asuncion' },
  { code: 'SV', name: 'El Salvador',          currency: 'USD', decimalSeparator: '.', primaryTimezone: 'America/El_Salvador' },
  { code: 'UY', name: 'Uruguay',              currency: 'UYU', decimalSeparator: ',', primaryTimezone: 'America/Montevideo' },
  { code: 'VE', name: 'Venezuela',            currency: 'VES', decimalSeparator: ',', primaryTimezone: 'America/Caracas' },
] as const;

export const LATAM_COUNTRY_CODES: readonly string[] = LATAM_COUNTRIES.map((c) => c.code);

export function findLatamCountry(code: string): LatamCountry | undefined {
  return LATAM_COUNTRIES.find((c) => c.code === code);
}
```

> La tabla de separadores por país es un **default razonable**; el usuario puede overridearlo.
> No se busca exactitud absoluta de convención local.

#### A.2 Endpoint público de países

`GET /v1/onboarding/countries` (`@Public()`), responde ordenado por `name`:

```jsonc
[
  { "code": "AR", "name": "Argentina", "currency": "ARS", "defaultDecimalSeparator": "," },
  ...
]
```

Serializer dedicado (`CountryOptionSerializer`) con `@ApiProperty` para Swagger.

#### A.3 DTO (`OnboardingRegisterDto`)

- `country` — **requerido**, `@IsIn(LATAM_COUNTRY_CODES)`. Mensaje (inglés): `"country must be a supported LATAM ISO code"`.
- `decimalSeparator` — **opcional**, `@IsIn(['.', ','])`. Si se omite → default del país.
- `timezone` — se mantiene `@IsTimeZone() @IsNotEmpty()` (lo envía el navegador).

#### A.4 Service y persistencia

- `OnboardingInput` gana `country: string` y `decimalSeparator?: '.' | ','`.
- En `setupCoreEntities`, derivar antes de crear:
  - `const country = findLatamCountry(input.country)` (garantizado por el DTO; si falta, lanzar `OnboardingFailedException`).
  - `currency = country.currency`.
  - `decimalSeparator = input.decimalSeparator ?? country.decimalSeparator`.
  - `thousandsSeparator = decimalSeparator === '.' ? ',' : '.'`.
  - `timezone` normalizado: si el del input **no pertenece** a los timezones del país
    (`countries-and-timezones`), usar el `primaryTimezone` curado del país (no `timezones[0]`,
    que puede ser no-canónico — ej. CL devuelve `America/Coyhaique`). Garantiza consistencia
    `timezone ∈ country` para que la edición posterior en settings no quede bloqueada.
- `RestaurantsService.createRestaurant` se extiende a un **objeto de opciones**:
  ```ts
  createRestaurant(
    input: { name: string; timezone?: string; country?: string; currency?: string;
             decimalSeparator?: string; thousandsSeparator?: string },
    tx?: TransactionClient,
  ): Promise<Restaurant>
  ```
  Los 2 callers de CLI (`create-restaurant`, `create-dummy`) se actualizan a la nueva firma
  (mantienen comportamiento actual pasando solo `name`/`timezone`; el resto cae a defaults del schema).
- `RestaurantRepository.createWithSettings` persiste los campos provistos
  (`country`, `currency`, `decimalSeparator`, `thousandsSeparator`, `timezone`).

> **Sin migración de Prisma**: el schema ya tiene los 5 campos en `RestaurantSettings`.

#### A.5 Frontend (wizard)

- `Step1Form`:
  - `<select>` de país poblado vía fetch a `/v1/onboarding/countries` (estado de carga simple).
  - Radios de separador decimal; al cambiar país se **preselecciona** su `defaultDecimalSeparator`,
    pero el usuario puede overridear.
  - El submit del paso 1 ahora incluye `country` y `decimalSeparator`.
- `OnboardingWizard`:
  - `Step1Data` gana `country: string` y `decimalSeparator: '.' | ','`.
  - `handleStep2Submit` agrega `country` y `decimalSeparator` al `FormData`.
  - `timezone` se sigue mandando con `Intl.DateTimeFormat().resolvedOptions().timeZone`.

---

### Parte B — Contrato de error unificado

#### B.1 Forma canónica (toda la API)

```jsonc
{
  "message": string[],   // SIEMPRE array. Validación → N mensajes; custom → 1 elemento
  "code": string,        // SIEMPRE presente
  "statusCode": number,
  "details"?: object     // opcional, solo si la excepción lo provee (ej. { email })
}
```

Mensajes técnicos **en inglés**; el friendly en español lo resuelve el frontend por `code`.

#### B.2 `exceptionFactory` global (`main.ts`)

Agregar al `ValidationPipe`:
```ts
new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) => {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    return new BadRequestException({
      message: messages,            // string[]
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  },
})
```
Esto **toma el control del body** → se elimina el `error: "Bad Request"` y se agrega `code`.

#### B.3 `BaseException` → `message` como array

`src/common/exceptions/base.exception.ts`: envolver `message` en array de un elemento:
```ts
super({ message: [message], code, details, statusCode }, statusCode);
```
Mantiene `code`/`details`/`statusCode`. Unifica las dos familias.

**Costo conocido:** tests existentes que asertan `message` como string deben actualizarse a
`message[0]` o `['...']`. Localizar y ajustar (al menos `test/products.e2e-spec.ts:288`,
`test/products/updateProduct.e2e-spec.ts:165`, y otros que el grep revele).

#### B.4 Idioma de los mensajes

- Mensajes **nuevos** (país/separador inválidos) en inglés.
- **Migrar a inglés** los mensajes del DTO de onboarding (hoy en español, ej. `"El email debe
  ser válido"` → `"email must be valid"`). Actualizar los e2e de validación que comparen texto.

---

### Parte C — Tipos `any` y documentación de errores

#### C.1 Cero `any`

- ESLint ya prohíbe `any` (`@typescript-eslint/no-explicit-any: 'error'`). Todo el código
  nuevo con tipos explícitos e interfaces; `pnpm lint` como gate de la implementación.
- Opcional: tipar el mock `tx: unknown` del spec como `Prisma.TransactionClient`. El
  `photo?: unknown` del DTO se mantiene (whitelisted; `unknown` es type-safe, no es `any`).

#### C.2 Catálogo de errores (`.md`)

Nuevo doc `apps/api-core/docs/onboarding-error-mapping.md` con una tabla:
`code` → HTTP → cuándo ocurre → shape de `details` → mensaje friendly sugerido (ES).
Incluye los warnings de 201 (`products_extraction_failed`, `products_creation_failed`) y el
throttle (429). Añadir entrada al índice `apps/api-core/docs/README.md`.

Códigos a catalogar:

| Code | HTTP | Significado |
|---|---|---|
| `VALIDATION_ERROR` | 400 | DTO inválido (incluye país/separador/email/timezone) |
| `EMAIL_ALREADY_EXISTS` | 409 | email ya registrado |
| `ONBOARDING_FAILED` | 500 | error inesperado en setup |
| `RESTAURANT_CREATION_FAILED` | 500 | falla crear restaurante |
| `USER_CREATION_FAILED` | 500 | falla crear usuario |
| `DEFAULT_CATEGORY_CREATION_FAILED` | 500 | falla crear categoría default |
| *(throttle)* | 429 | > 5 req / 15 min |
| `products_extraction_failed` | 201 (warning) | Gemini no extrajo productos |
| `products_creation_failed` | 201 (warning) | falló crear productos demo |

#### C.3 Swagger

Reforzar los `@ApiResponse` del `OnboardingController` (register + countries) con los `code`
y ejemplos del body unificado. Documentar cada excepción con un comentario en su definición.

#### C.4 ADR

Nuevo **ADR 0007 — Contrato de error unificado de la API** (MADR en español, en
`apps/api-core/docs/adr/`): contexto (inconsistencia validación vs custom), decisión
(`message: string[]` + `code` + `statusCode` + `details?`, mensajes en inglés, friendly en
frontend), consecuencias, alternativas. Registrarlo en el índice `docs/adr/README.md`.

#### C.5 CLAUDE.md (conciso)

Agregar una sección breve de convenciones del backend:
- **Sin `any`**: prohibido en todo el proyecto (ESLint lo enforce); usar `unknown` + narrowing.
- **Errores**: toda excepción documentada con comentario + `@ApiResponse` en Swagger; el
  contrato de error sigue el **ADR 0007** (`message: string[]`, `code`, `statusCode`, `details?`).

---

### Parte D — Falla de email y reenvío (verificación + documentación)

**Verificado:**
- El envío de activación es **no bloqueante**: el onboarding responde **201 aunque el email
  falle** (solo no se entrega).
- El reenvío **ya existe**: `POST /v1/auth/recover { email }` (throttle 3/15min). Para cuenta
  inactiva reenvía el email de activación. **Ya está cableado** en `Step3Success` →
  `onResend` → `handleResend` del wizard.
- **Gap conocido:** `recoverAccount` traga las fallas de envío (catch + log) y siempre responde
  200 genérico → la UI muestra "enviado" aunque el segundo envío también falle.

**Acción:** documentar este flujo y el gap en `onboarding-error-mapping.md` (sección "Email y
reenvío"). **Sin cambio funcional** en este spec.

---

## 6. Archivos afectados

**api-core**
- `src/onboarding/data/latam-countries.ts` *(nuevo)*
- `src/onboarding/onboarding.controller.ts` (endpoint countries + Swagger)
- `src/onboarding/serializers/country-option.serializer.ts` *(nuevo)*
- `src/onboarding/dto/onboarding-register.dto.ts` (country, decimalSeparator, mensajes en inglés)
- `src/onboarding/onboarding.service.ts` (derivación + normalización timezone)
- `src/restaurants/restaurants.service.ts` (firma `createRestaurant` a objeto de opciones)
- `src/restaurants/restaurant.repository.ts` (`createWithSettings` persiste 5 campos)
- `src/cli/commands/create-restaurant.command.ts`, `create-dummy.command.ts` (nueva firma)
- `src/main.ts` (`exceptionFactory`)
- `src/common/exceptions/base.exception.ts` (`message` a array)
- `docs/onboarding-error-mapping.md` *(nuevo)*, `docs/README.md`, `docs/adr/0007-*.md` *(nuevo)*, `docs/adr/README.md`
- Tests: spec de onboarding, e2e de validación/conflicto, tests que asertan `message` string

**ui**
- `src/components/onboarding/Step1Form.tsx` (select país + radios separador + fetch)
- `src/components/onboarding/OnboardingWizard.tsx` (Step1Data + FormData)
- `src/lib/error-messages.ts` (cubrir todos los codes; forward-looking)
- Tests: `Step1Form.test.tsx`, `OnboardingWizard.test.tsx`

**raíz**
- `CLAUDE.md` (convenciones: sin `any`, documentación de errores + ADR 0007)

---

## 7. Plan de pruebas

**Backend (dentro del contenedor Docker):**
- `GET /v1/onboarding/countries`: shape, orden por nombre, `defaultDecimalSeparator`.
- DTO: país inválido → 400 `VALIDATION_ERROR`; separador inválido → 400; country ausente → 400.
- Derivación: `currency` ← país; `thousandsSeparator` ← decimal; separador default vs override.
- Normalización timezone: timezone ajeno al país → fallback al primario.
- `exceptionFactory`: 400 con `message: string[]` + `code: 'VALIDATION_ERROR'`, sin `error`.
- `BaseException`: `message` siempre array (ajustar e2e existentes).
- Persistencia: `RestaurantSettings` con los 5 campos correctos.

**Frontend:**
- `Step1Form`: renderiza select de país, preselección/override del separador, fetch de países.
- `OnboardingWizard`: payload del submit incluye `country`, `decimalSeparator`, `timezone`.

---

## 8. Riesgos

- **Cambio global del contrato de error.** `BaseException → array` y `exceptionFactory` afectan
  toda la API. Mitigado por: tests existentes que se actualizan, y el frontend mapea por `code`
  (que ahora está garantizado en ambas familias). El único consumidor del API es `apps/ui`.
- **Drift de la tabla LatAm.** Mitigado por la fuente única (endpoint); el frontend nunca
  hardcodea la lista.
