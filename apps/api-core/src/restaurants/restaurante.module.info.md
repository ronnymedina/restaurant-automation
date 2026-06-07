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
