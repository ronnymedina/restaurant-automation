# Restaurant Settings — Update endpoint (unified) — Design

**Fecha:** 2026-05-31
**Módulos afectados:** `restaurants` (backend), `dash/settings` (UI)
**Estado:** Pendiente revisión
**Tipo:** Feature spec (no implementación)
**Supersedes:** [`2026-05-25-restaurant-settings-dashboard-module.md`](./2026-05-25-restaurant-settings-dashboard-module.md) (nunca implementado; diseño anterior con cinco campos editables independientes y `PATCH /name` separado)

---

## Contexto

El módulo `restaurants` expone hoy dos endpoints (`apps/api-core/src/restaurants/restaurants.controller.ts`):

- `GET /v1/restaurants/settings` → devuelve `{ timezone, country, currency, decimalSeparator, thousandsSeparator }` (sin `name`/`slug`).
- `PATCH /v1/restaurants/name` → ADMIN-only, renombra y regenera `slug`.

No existe un endpoint para editar timezone, currency ni los separadores. La página `apps/ui/src/pages/dash/settings.astro` es **código huérfano**: invoca `PATCH /v1/restaurants/settings` con un campo `defaultReservationDuration` que no está en el schema ni en backend, lo que falla silenciosamente.

El spec previo (2026-05-25) propuso un endpoint `PATCH /settings` con los cinco campos editables, validación cross-field `decimal ≠ thousands` y `PATCH /name` separado. Este spec lo reemplaza con un diseño más simple: **un endpoint único que también unifica el rename**.

## Goal

Un único `PATCH /v1/restaurants/settings` (ADMIN-only) que permita actualizar los datos editables del restaurante en una operación atómica:

- `name` (de la tabla `Restaurant`)
- `timezone`, `currency`, `decimalSeparator` (de la tabla `RestaurantSettings`)

Y un `GET /v1/restaurants/settings` extendido que devuelva todo lo necesario para popular el formulario, incluyendo los campos read-only (`country`, `slug`).

## Out of scope

- **`country`**: read-only en este endpoint. Se setea en el onboarding (o por default `CL`) y no se edita por la UI. El día que se necesite cambiarlo, va en un spec aparte porque requiere reconciliar timezone y currency.
- **`thousandsSeparator` como campo independiente**: el cliente solo envía `decimalSeparator`; el backend deriva el de miles (`.` ↔ `,`). Justificación: si el cliente solo acepta `.` y `,`, conocer uno determina el otro. Quitar la decisión del cliente elimina cross-field errors.
- `kitchenTokenHash` / `kitchenTokenExpiresAt`: gestionados por `POST /v1/kitchen/token/generate`. No tocar acá.
- `defaultReservationDuration`: legacy huérfano (no existe en schema). Se quita de la UI sin reemplazo.
- Multi-currency por restaurante.
- Audit log de cambios.
- Setear `country` desde el onboarding (hoy default `CL` por schema).

## Decisiones de diseño

| Decisión | Resultado |
|---|---|
| Campos editables | `name`, `timezone`, `currency`, `decimalSeparator` |
| Campos de lectura | `country`, `slug` (en respuesta del GET y del PATCH) |
| Endpoints | Extender `GET /settings`; nuevo `PATCH /settings`; **eliminar** `PATCH /name` |
| Roles | `ADMIN` solo (consistente con el `PATCH /name` que reemplaza) |
| Tenant | `restaurantId` siempre del JWT vía `@CurrentUser()`. No hay `:id` en la URL — estructuralmente imposible operar cross-tenant |
| Lib timezones | `countries-and-timezones` (lookup `country → timezones[]`) |
| Lib currency | `currency-codes` (validación ISO 4217) |
| Separadores | Cliente manda `decimalSeparator`; backend deriva `thousandsSeparator` |
| Validación timezone-vs-country | En el **service**, no en el DTO (depende de BD) |
| Cambio de `name` | Regenera `slug` reutilizando `RestaurantsService.generateSlug` |

## API surface

### `GET /v1/restaurants/settings` (extendido)

Sin cambios de auth (sigue requiriendo JWT, cualquier rol). Solo cambia la respuesta:

```jsonc
{
  "name": "Mi Restaurante",
  "slug": "mi-restaurante",
  "country": "CL",
  "timezone": "America/Santiago",
  "currency": "CLP",
  "decimalSeparator": ",",
  "thousandsSeparator": "."
}
```

`name` y `slug` provienen de `Restaurant`; el resto de `RestaurantSettings`.

### `PATCH /v1/restaurants/settings` (NUEVO, reemplaza `PATCH /name`)

```
Auth: JwtAuthGuard + RolesGuard(ADMIN)
Body: UpdateRestaurantSettingsDto (todos los campos opcionales)
Response 200: el mismo shape del GET (estado completo post-update)

Errores:
  400 BAD_REQUEST           shape inválido (DTO) o regla de negocio (timezone vs country, etc.)
  401 UNAUTHORIZED          sin token
  403 FORBIDDEN             rol distinto de ADMIN
  404 NOT_FOUND             restaurante (o su row de settings) no existe
  409 DUPLICATE_RESTAURANT  `name` colisiona con slug existente tras `generateSlug`
```

Comportamiento:
- Body `{}` → no-op, devuelve estado actual con 200.
- Si `name` cambia respecto a BD → regenera slug (`RestaurantsService.generateSlug`).
- Si `decimalSeparator` viene → backend setea `thousandsSeparator` al carácter complementario (`.` ↔ `,`).
- Si `timezone` viene → validar que pertenezca a `ct.getCountry(settings.country).timezones`. Si no → 400 `TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY`.
- Restaurant + Settings se actualizan en una sola tx Prisma.

### `PATCH /v1/restaurants/name` (ELIMINADO)

Su funcionalidad queda subsumida en `PATCH /settings`. Sin consumidores en UI (verificado por grep sobre `apps/ui/src`).

## DTO

`apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts` (nuevo):

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsValidCurrencyCode } from './validators/is-valid-currency-code.validator';

export class UpdateRestaurantSettingsDto {
  @ApiPropertyOptional({ example: 'Mi Restaurante', maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ example: 'America/Santiago', description: 'IANA timezone; debe pertenecer al country actual' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'ISO 4217 currency code' })
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

Notas:
- No incluye `restaurantId`, `country`, `slug`, ni `thousandsSeparator` — ninguno proviene del cliente.
- El `ValidationPipe` global usa `whitelist: true` (ver `apps/api-core/src/main.ts`), por lo que campos extra en el body se descartan silenciosamente antes de llegar al controller.
- `timezone` solo se valida en shape (string). La validación timezone-vs-country vive en el service.

### Validator custom `IsValidCurrencyCode`

`apps/api-core/src/restaurants/dto/validators/is-valid-currency-code.validator.ts` (nuevo):

Implementa `ValidatorConstraintInterface` y delega en `cc.code(value)` de `currency-codes`. Falla si el código no existe o no es uppercase.

### `RestaurantSettingsDto` (extendido)

`apps/api-core/src/restaurants/dto/restaurant-settings.dto.ts` ya existe. Sumar `name: string` y `slug: string`. Actualizar `DEFAULT_RESTAURANT_SETTINGS` con valores vacíos para los nuevos campos (`name: ''`, `slug: ''`).

### Excepción nueva

`apps/api-core/src/restaurants/exceptions/timezone-not-available-for-country.exception.ts`:

```ts
export class TimezoneNotAvailableForCountryException extends BadRequestException {
  constructor(timezone: string, country: string) {
    super({
      code: 'TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY',
      message: `La zona horaria '${timezone}' no está disponible para el país '${country}'`,
    });
  }
}
```

`RestaurantNotFoundException` y `DuplicateRestaurantException` ya existen — se reutilizan.

## Service

`apps/api-core/src/restaurants/restaurants.service.ts`:

```ts
async updateSettings(
  restaurantId: string,
  dto: UpdateRestaurantSettingsDto,
): Promise<RestaurantSettingsDto> {
  // 1. Defensa multi-tenant: cargar el restaurante por el id del JWT.
  //    Si el JWT apunta a un restaurante que no existe → 404.
  const current = await this.restaurantRepository.findByIdWithSettings(restaurantId);
  if (!current || !current.settings) throw new RestaurantNotFoundException(restaurantId);

  // 2. timezone debe pertenecer al country actual.
  if (dto.timezone && !this.isTimezoneAllowedForCountry(dto.timezone, current.settings.country)) {
    throw new TimezoneNotAvailableForCountryException(dto.timezone, current.settings.country);
  }

  // 3. Derivar el separador de miles del decimal.
  const thousandsSeparator = dto.decimalSeparator
    ? (dto.decimalSeparator === '.' ? ',' : '.')
    : undefined;

  // 4. Regenerar slug si el nombre cambia.
  const newSlug = dto.name && dto.name !== current.name
    ? await this.generateSlug(dto.name)
    : undefined;

  // 5. Atomic update (restaurant + settings en una tx).
  const updated = await this.restaurantRepository.updateWithSettings(restaurantId, {
    restaurant: {
      ...(dto.name ? { name: dto.name } : {}),
      ...(newSlug ? { slug: newSlug } : {}),
    },
    settings: {
      ...(dto.timezone ? { timezone: dto.timezone } : {}),
      ...(dto.currency ? { currency: dto.currency } : {}),
      ...(dto.decimalSeparator ? { decimalSeparator: dto.decimalSeparator, thousandsSeparator } : {}),
    },
  });

  // 6. Invalidar cache de timezone si cambió (TimezoneService ya expone invalidate()).
  if (dto.timezone && dto.timezone !== current.settings.timezone) {
    await this.timezoneService.invalidate(restaurantId);
  }

  return toRestaurantSettingsDto(updated);
}

private isTimezoneAllowedForCountry(timezone: string, country: string): boolean {
  const countryEntry = ct.getCountry(country);
  return countryEntry?.timezones?.includes(timezone) ?? false;
}
```

Notas:
- El método `rename(id, name)` del service queda inactivo. Se elimina junto con el controller endpoint.
- Las P2002 de Prisma (slug duplicado) se mapean a `DuplicateRestaurantException` en el repositorio o el service (donde se hace hoy el `rename`).

## Repository

`apps/api-core/src/restaurants/restaurant.repository.ts`:

Nuevo método `updateWithSettings(restaurantId, { restaurant, settings })`:

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

Defensa multi-tenant: `restaurantSettings.update` usa `where: { restaurantId }` explícito (defense in depth — `restaurantId` del JWT, no del cliente).

## Multi-tenant safety

Aplica el patrón documentado en `MEMORY.md` (feedback `feedback-multitenant-restaurantid-from-jwt`):

- Controller: `@CurrentUser() user: { restaurantId: string }` único origen del tenant. URL **sin `:id`**. Guards `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`.
- Service: primera operación `findByIdWithSettings(restaurantId)`; si retorna null → 404 (no 403, para no filtrar existencia).
- Repository: queries sobre `RestaurantSettings` siempre con `where: { restaurantId }`.
- DTO: no declara `restaurantId` ni `id`. `whitelist: true` del `ValidationPipe` descarta campos extra.

Antecedente equivalente en otros módulos: ver `apps/api-core/src/orders/orders.service.ts:173-181` (audit H-20) — misma convención para `kitchenAdvanceStatus`.

## Libs a agregar

`apps/api-core/package.json` → `dependencies`:

```
"countries-and-timezones": "^3.x",
"currency-codes": "^2.x"
```

Ambas sin dependencias transitivas relevantes. `countries-and-timezones` se importa solo en `restaurants.service.ts`. `currency-codes` se importa solo en `validators/is-valid-currency-code.validator.ts`.

## UI — `apps/ui/src/pages/dash/settings.astro`

Reemplazo completo del contenido. La página queda con un solo formulario que actualiza todos los campos editables; los read-only se renderizan deshabilitados.

Campos del form:
- **Nombre** — `<input type="text" maxlength="255">` (editable).
- **País** — `<input disabled>` con valor de `country` (read-only).
- **Zona horaria** — `<select>` poblado por `ct.getCountry(country).timezones` (lookup en cliente con `countries-and-timezones`, o se entrega ya hecho desde un nuevo endpoint `GET /v1/restaurants/supported-timezones`; decisión queda al plan de implementación).
- **Moneda** — `<input type="text" maxlength="3" pattern="[A-Z]{3}">`.
- **Formato decimal** — radios `Punto (1,234.56)` / `Coma (1.234,56)`. Envía solo `decimalSeparator`.
- **Slug** — `<input disabled>` (informativo).

Comportamiento:
- Load: `GET /v1/restaurants/settings` → popular valores.
- Submit: `PATCH /v1/restaurants/settings` con solo los campos que cambiaron (dirty check).
- Errors mapeados a mensajes en español:
  - `TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY` → "La zona horaria no está disponible para tu país."
  - `DUPLICATE_RESTAURANT` → "Ya existe un restaurante con un nombre similar."
  - 403 → "Solo administradores pueden modificar la configuración."
- Tras un guardado exitoso de `timezone` o `decimalSeparator`/`currency`: `queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] })` para refrescar el wizard de creación de orden sin hard reload (consistente con el patrón propuesto en el spec previo).

`apps/ui/src/lib/restaurant-settings.ts`: extender el tipo de retorno con `name: string` y `slug: string` (y opcionalmente `country`).

## Tests

Todos los tests corren **dentro del contenedor Docker** (`docker compose exec res-api-core pnpm test...`), según convención del proyecto.

### Unit — `restaurants.service.spec.ts` (nuevo o extendido)

| Caso | Expectativa |
|---|---|
| `updateSettings` con name nuevo único | repo.updateWithSettings recibe slug regenerado |
| `updateSettings` con name igual al actual | no regenera slug |
| `updateSettings` con timezone válido para el country | persiste y llama `timezoneService.invalidate` |
| `updateSettings` con timezone que no pertenece al country | lanza `TimezoneNotAvailableForCountryException` |
| `updateSettings` con `decimalSeparator: '.'` | `thousandsSeparator: ','` se incluye en el update |
| `updateSettings` con `decimalSeparator: ','` | `thousandsSeparator: '.'` se incluye en el update |
| `updateSettings` con currency válido | pasa al repo tal cual |
| `updateSettings` con body vacío `{}` | repo.updateWithSettings se llama con objetos vacíos; no-op semántico |
| `updateSettings` cuando el restaurante no existe | lanza `RestaurantNotFoundException` |
| `updateSettings` no llama `timezoneService.invalidate` si timezone no cambió | verificar `not.toHaveBeenCalled` |

### Unit — `is-valid-currency-code.validator.spec.ts` (nuevo)

| Input | Resultado |
|---|---|
| `'USD'` | válido |
| `'CLP'` | válido |
| `'XXX'` (no asignado) | inválido |
| `'us'` (lowercase) | inválido |
| `''` | inválido (cubierto también por `@Length(3,3)`) |

### Unit — `restaurants.controller.spec.ts` (extendido)

| Caso | Status |
|---|---|
| MANAGER llama PATCH /settings | 403 (vía RolesGuard mock) |
| ADMIN llama PATCH /settings con DTO válido | 200, devuelve shape extendido |
| ADMIN llama GET /settings | 200, incluye `name` y `slug` |

### E2E — `test/restaurants/settings.e2e-spec.ts` (extendido)

Casos del PATCH (mantener los del GET existentes):

| Caso | Status |
|---|---|
| Sin token | 401 |
| MANAGER / BASIC | 403 |
| Body vacío `{}` | 200, GET subsiguiente sin cambios |
| name nuevo único | 200, slug regenerado (verificar via GET) |
| name vacío | 400 (`@Length(1,255)`) |
| name >255 chars | 400 |
| name duplicado | 409 `DUPLICATE_RESTAURANT` |
| timezone no IANA conocido | 400 `TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY` |
| timezone IANA pero de otro country | 400 `TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY` |
| timezone válido para CL (default) | 200 |
| currency `'XXX'` | 400 (validator) |
| currency `'USD'` | 200 |
| decimalSeparator `'.'` | 200, GET muestra thousands=`,` |
| decimalSeparator `';'` (no permitido) | 400 (`@IsIn`) |
| ADMIN de B solo afecta B | 200, restaurante A en BD sin cambios |
| GET incluye name + slug | 200, shape verificado |

Eliminar `test/restaurants/rename.e2e-spec.ts` y `test-rename.db` — sus casos quedan cubiertos por settings.

## Module info

Actualizar `apps/api-core/src/restaurants/restaurante.module.info.md` con el contenido nuevo:

```markdown
### Restaurants

#### Get settings — `GET /v1/restaurants/settings`

Devuelve `{ name, slug, country, timezone, currency, decimalSeparator, thousandsSeparator }`.
`country` y `slug` se renderizan en UI como read-only.

#### Update settings — `PATCH /v1/restaurants/settings` (ADMIN only)

Campos opcionales: `name`, `timezone`, `currency`, `decimalSeparator`.
- name → regenera `slug` si cambia.
- timezone → debe pertenecer a los timezones del `country` actual (lookup `countries-and-timezones`).
- currency → ISO 4217 válido (`currency-codes`).
- decimalSeparator → `.` o `,`. Backend deriva `thousandsSeparator` excluyente.

E2E: `test/restaurants/settings.e2e-spec.ts`. (Ver tabla de casos en el spec del diseño.)

#### Seguridad multi-tenant

Todos los endpoints del módulo derivan `restaurantId` exclusivamente del JWT vía `@CurrentUser()`. Ningún endpoint acepta `restaurantId` ni `id` del restaurante en path o body. Esto vuelve estructuralmente imposible la operación cross-tenant.

- Controller: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` para PATCH.
- Service: primer call siempre `findByIdWithSettings(restaurantId)`; null → 404 (no 403, para no filtrar existencia).
- Repository: queries sobre `RestaurantSettings` siempre incluyen `restaurantId` en el `WHERE`.
- DTO: no declara `restaurantId`; `whitelist: true` descarta campos extra del body.

#### Endpoint removido

`PATCH /v1/restaurants/name` se elimina; su funcionalidad queda dentro del PATCH /settings unificado. DTO `RenameRestaurantDto` y e2e `rename.e2e-spec.ts` se borran.
```

## Migraciones

**Ninguna en BD.** Todos los campos editados ya existen en el schema. Solo cambia código.

## Breaking changes

- API interna: `PATCH /v1/restaurants/name` se elimina. Verificado por grep que no hay consumidores en `apps/ui/src`. Si existe un cliente externo (no debería), rompería.
- Tipo de respuesta de `GET /v1/restaurants/settings` se extiende con `name` y `slug` — additive, no rompe consumidores existentes.

## Implementation order (referencia para writing-plans)

1. Agregar libs `countries-and-timezones` + `currency-codes` al `package.json` y `pnpm install` dentro del contenedor.
2. DTO + validator custom + excepción nueva (con unit tests del validator).
3. Service `updateSettings` + repository `updateWithSettings` (con unit tests del service).
4. Controller: extender `GET /settings`, agregar `PATCH /settings`, eliminar `PATCH /name`.
5. Eliminar `rename-restaurant.dto.ts`, `rename.e2e-spec.ts`, método `rename` del service.
6. Extender `RestaurantSettingsDto` con `name` y `slug`; actualizar `DEFAULT_RESTAURANT_SETTINGS`.
7. Extender `test/restaurants/settings.e2e-spec.ts` con la matriz de casos.
8. Actualizar `restaurante.module.info.md`.
9. UI: reemplazar `dash/settings.astro` y actualizar `lib/restaurant-settings.ts`. Verificación manual de flujo end-to-end (cambiar moneda → wizard refleja sin hard refresh).

## Open questions

- **Endpoint `GET /v1/restaurants/supported-timezones`**: ¿lo agregamos en este spec o lo dejamos como follow-up? El cliente puede tener su propia copia de `countries-and-timezones` (web bundle ~50KB) y resolverlo client-side, evitando el round-trip. **Propuesta:** no agregar el endpoint; cliente resuelve localmente. Si crece el bundle, se reconsidera.
- **Mensaje de confirmación al cambiar timezone**: el spec previo proponía un modal "esto afecta reportes". ¿Lo mantenemos? **Propuesta:** sí, opcional como mejora de UX dentro del UI work — no es un requisito de backend, queda fuera del scope crítico de este spec.

## Verificación de aceptación

- [ ] `PATCH /v1/restaurants/settings` con name nuevo único → 200 + slug regenerado.
- [ ] PATCH con timezone que no pertenece al country → 400 `TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY`.
- [ ] PATCH con currency inválido → 400.
- [ ] PATCH con decimalSeparator=`.` → GET subsiguiente muestra `thousandsSeparator=','`.
- [ ] PATCH como MANAGER → 403.
- [ ] PATCH sin token → 401.
- [ ] Cross-tenant: ADMIN de B llama PATCH; restaurant A intacto en BD.
- [ ] GET incluye `name` y `slug`.
- [ ] UI: cambiar moneda + guardar → wizard de orden refleja el nuevo formato sin hard reload.
- [ ] La sección de "Reservas" rota desaparece de la página.
- [ ] `PATCH /v1/restaurants/name` retorna 404 (endpoint eliminado).
