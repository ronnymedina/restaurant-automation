# Restaurant Settings — Módulo de configuración editable desde dashboard

**Fecha:** 2026-05-25
**Módulos afectados:** `restaurants` (backend), `dash/settings` (UI)
**Estado:** ⚠️ **Superseded** por [`2026-05-31-restaurant-settings-update-design.md`](./2026-05-31-restaurant-settings-update-design.md)
**Tipo:** Feature spec (no implementación)
**Autor:** Audit follow-up + UX request

> **Nota (2026-05-31):** Este spec nunca se implementó. El diseño de reemplazo
> simplifica el endpoint (un único `PATCH /settings` que incluye `name` y elimina
> `PATCH /name`), bloquea `country` como read-only, deriva `thousandsSeparator`
> del decimal, y liga la validación de `timezone` al `country` actual vía
> `countries-and-timezones`. Las preguntas abiertas de este documento sobre
> editar `name` y validar `currency↔country` quedan resueltas en el nuevo spec.

---

## Contexto

Hoy `RestaurantSettings` guarda 5 campos relevantes para el funcionamiento del restaurante:

| Campo | Default | Quién lo usa hoy |
|---|---|---|
| `timezone` | `"UTC"` | Reportes de cocina, historial de órdenes, kiosk (`menu availability`) |
| `country` | `"CL"` | Nuevo — display de moneda (sin uso runtime aún) |
| `currency` | `"CLP"` | Nuevo — display de moneda |
| `decimalSeparator` | `","` | `formatMoney` en el wizard de creación de orden |
| `thousandsSeparator` | `"."` | `formatMoney` en el wizard de creación de orden |

El `timezone` se setea **una sola vez** durante el onboarding (`OnboardingWizard.tsx:93` envía `Intl.DateTimeFormat().resolvedOptions().timeZone`). Los demás se setean por default. Después de eso **no hay forma de editarlos** desde la UI:

- `GET /v1/restaurants/settings` existe y retorna los 5 campos (post H-02).
- `PATCH /v1/restaurants/settings` **no existe**. El controller solo expone `GET settings` y `PATCH name`.
- La página `/dash/settings` ya existe pero está rota: llama a `PATCH /v1/restaurants/settings` con `{ defaultReservationDuration: ... }` — un campo que no está en el schema. El submit retorna 404 silencioso.
- El link `/dash/settings` está comentado en `DashboardLayout.astro:19` con la nota "ocultar hasta que tenga más contenido".

**Resultado:** si un cliente cambia de país, o el dueño escribió mal su timezone al onboarding, hoy hay que entrar a la BD a mano.

---

## Goal

Permitir que un usuario **ADMIN** edite desde `/dash/settings` los 5 campos de `RestaurantSettings`:

1. `timezone` (afecta reportes y horarios de menús)
2. `country` (informativo + driver de defaults)
3. `currency` (display)
4. `decimalSeparator` (display)
5. `thousandsSeparator` (display)

Y que esos cambios se reflejen inmediatamente en el wizard de creación de orden y en cualquier vista que use el helper `formatMoney`.

---

## Out of scope

- `kitchenToken` y `kitchenTokenExpiresAt` — ya tienen su propio flujo (`POST /v1/kitchen/token/generate`) y no se editan como "settings".
- `defaultReservationDuration` — el campo no existe en el schema; la sección de "Reservas" en `/dash/settings` se elimina (no se reemplaza con algo equivalente en este spec).
- Aplicar `formatMoney` en `OrderCard.tsx` y `OrdersPanel.tsx` — eso es H-38 del audit, PR separado.
- Multi-currency dentro de un mismo restaurante (un restaurante que cobre USD y CLP simultáneamente). Para eso habría que rediseñar `Order.totalAmount`.
- Setear `country`/`currency` desde el onboarding (hoy solo se setea timezone). Se puede agregar después; el default `CL`/`CLP` es razonable para clientes iniciales.

---

## Permisos

**Solo `ADMIN`.** Justificación:

- Cambiar `timezone` afecta agregaciones de reportes (todos los `Intl.DateTimeFormat` consumen ese valor) — un error tira los números del cierre de caja.
- Cambiar `currency`/separadores afecta a todos los cajeros (visualmente). Un MANAGER no debería poder modificar la presentación global.
- `RolesGuard` ya existe; la decoración es trivial: `@Roles(Role.ADMIN)`.

Defensa en profundidad:
- Backend valida el rol vía `RolesGuard`.
- UI esconde la sección si el JWT no es ADMIN (no es un control de seguridad — es UX, evita errores 403 sorpresa al guardar).

---

## Backend

### Endpoint

```
PATCH /v1/restaurants/settings
Auth: JWT + RolesGuard(ADMIN)
Body: UpdateRestaurantSettingsDto (todos opcionales — patch parcial)
Response: 200 RestaurantSettingsDto (el shape completo, incluido lo no modificado)
Errores: 400 (validación), 401 (sin token), 403 (no ADMIN), 404 (settings row faltante — edge case)
```

### DTO `UpdateRestaurantSettingsDto`

Ubicación: `apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts`

```ts
export class UpdateRestaurantSettingsDto {
  @IsOptional()
  @IsString()
  @IsIanaTimezone() // custom validator — ver abajo
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1)
  @Matches(/^[.,\s]$/) // solo punto, coma o espacio
  decimalSeparator?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1)
  @Matches(/^[.,\s]$/)
  thousandsSeparator?: string;
}
```

Adicional: validar cross-field que **`decimalSeparator !== thousandsSeparator`**. Si el cajero define ambos como `,`, el render de `formatMoney` produce strings ambiguos (`$1,000,00`). Usar `@ValidateIf` + custom validator o validar en el service y lanzar 400 con código `INVALID_SEPARATORS_DUPLICATE`.

### Validator custom `@IsIanaTimezone`

`Intl.DateTimeFormat` lanza `RangeError` con timezone inválido (H-29 del audit menciona esto). Validar antes de persistir:

```ts
@ValidatorConstraint({ name: 'IsIanaTimezone', async: false })
class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: string) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'timezone debe ser una zona horaria IANA válida (ej. America/Santiago)';
  }
}

export function IsIanaTimezone() {
  return registerDecorator({ ... validator: IsIanaTimezoneConstraint });
}
```

Ubicación: `apps/api-core/src/common/decorators/is-iana-timezone.decorator.ts`.

### Controller

`apps/api-core/src/restaurants/restaurants.controller.ts`:

```ts
@Patch('settings')
@Roles(Role.ADMIN)
@ApiOperation({ summary: 'Update restaurant settings (ADMIN only)' })
@ApiResponse({ status: 200, type: RestaurantSettingsDto })
async updateSettings(
  @CurrentUser() user: { restaurantId: string },
  @Body() dto: UpdateRestaurantSettingsDto,
): Promise<RestaurantSettingsDto> {
  return this.restaurantsService.updateSettings(user.restaurantId, dto);
}
```

### Service `updateSettings`

`apps/api-core/src/restaurants/restaurants.service.ts`:

```ts
async updateSettings(
  restaurantId: string,
  data: UpdateRestaurantSettingsDto,
): Promise<RestaurantSettingsDto> {
  // 1. Validar que existe la fila de settings.
  const existing = await this.restaurantRepository.findSettings(restaurantId);
  if (!existing) {
    throw new NotFoundException('Restaurant settings not found');
  }

  // 2. Cross-field: separadores distintos (defensa en backend, no solo DTO).
  const finalDecimal = data.decimalSeparator ?? existing.decimalSeparator;
  const finalThousands = data.thousandsSeparator ?? existing.thousandsSeparator;
  if (finalDecimal === finalThousands) {
    throw new BadRequestException({
      code: 'INVALID_SEPARATORS_DUPLICATE',
      message: 'decimalSeparator y thousandsSeparator deben ser distintos',
    });
  }

  // 3. Persistir.
  const updated = await this.restaurantRepository.updateSettings(restaurantId, data);

  // 4. Invalidar cache de timezone si cambió.
  if (data.timezone && data.timezone !== existing.timezone) {
    await this.timezoneService.invalidate(restaurantId);
  }

  // 5. Devolver el shape completo (no parcial).
  return toRestaurantSettingsDto(updated);
}
```

### Repository

Extender `RestaurantRepository`:
- `findSettings(restaurantId)` — getter dedicado (hoy solo hay `findByIdWithSettings`, que trae la entidad Restaurant entera; este sería más liviano).
- `updateSettings(restaurantId, partial)` — `prisma.restaurantSettings.update({ where: { restaurantId }, data: partial })`.

### Cache invalidation

`TimezoneService` ya tiene `invalidate(restaurantId)` — lo usamos. **Importante:** inyectar `TimezoneService` en `RestaurantsService`. Hoy `RestaurantsService` no lo conoce; verificar que el módulo `RestaurantsModule` lo importe (debería estar ya por el `CacheModule`).

### Tests

**Unit (`restaurants.controller.spec.ts` + nuevo `restaurants.service.spec.ts` si no existe):**
- `updateSettings` con DTO completo → llama a repo + invalida cache si cambia timezone.
- `updateSettings` solo con `decimalSeparator` → no toca cache.
- `updateSettings` con `decimalSeparator === thousandsSeparator` → 400 con código.
- `updateSettings` con `timezone` inválido → 400 desde el validator (cubre H-29).
- `updateSettings` para restaurante sin fila de settings → 404.

**E2e (`test/restaurants/updateRestaurantSettings.e2e-spec.ts`):**
- ADMIN actualiza timezone → 200 + verificar que un GET subsiguiente refleja el cambio.
- MANAGER intenta actualizar → 403.
- BASIC intenta actualizar → 403.
- Sin token → 401.
- `country: "Chile"` (3+ letras) → 400 violación de regex.
- `decimalSeparator: ","` con `thousandsSeparator: ","` → 400 `INVALID_SEPARATORS_DUPLICATE`.
- `timezone: "Mars/Olympus"` → 400 `IsIanaTimezone`.
- Smoke: cambiar timezone, hacer una operación que dependa de él (ej. abrir caja, leer `displayOpenedAt`) y verificar la nueva TZ.

---

## Frontend

### Página `/dash/settings`

Reemplazar `apps/ui/src/pages/dash/settings.astro` por una estructura con **dos secciones**, cada una guarda de manera independiente para evitar el clásico "perdí mis cambios de timezone porque el form de moneda no validaba":

#### Sección 1 — General

| Campo | Tipo input | Validación cliente |
|---|---|---|
| Zona horaria | `<select>` con lista curada de IANA + opción "Otra (texto)" para edge cases | Debe ser non-empty string |

Lista curada inicial (LATAM-focused, ya que es donde están los clientes objetivo):
`America/Santiago`, `America/Buenos_Aires`, `America/Mexico_City`, `America/Bogota`, `America/Lima`, `America/Caracas`, `America/Sao_Paulo`, `America/Montevideo`, `UTC`.

#### Sección 2 — Formato de moneda

| Campo | Tipo input | Validación cliente |
|---|---|---|
| País | `<select>` (CL, AR, MX, CO, PE, UY, EC, BR, ...) | ISO 3166-1 alpha-2 |
| Moneda | `<select>` (CLP, ARS, MXN, COP, PEN, ...) | ISO 4217 |
| Separador decimal | radio: `,` / `.` | un solo char |
| Separador miles | radio: `.` / `,` / espacio | distinto del decimal |

**Live preview** debajo de la sección:

```
Vista previa:
  $25,00            ← número chico
  $1.234.567,89     ← número grande con miles
```

El preview usa el mismo helper `formatMoney` y re-renderiza on-change para que el ADMIN vea el resultado antes de guardar. Cero llamadas al backend para el preview.

**Auto-fill por país (opcional):** cuando el ADMIN cambia el `<select>` de país, mostrar un toast "¿Aplicar valores por defecto para Chile?" que precarga `currency`, `decimalSeparator`, `thousandsSeparator`. **No auto-aplicar sin confirmación** — el admin puede tener una preferencia distinta a la del país (un restaurante chileno que muestra USD para clientes extranjeros).

Tabla de defaults por país (driver del auto-fill, no del backend):

| Country | Currency | Decimal | Thousands |
|---|---|---|---|
| CL | CLP | `,` | `.` |
| AR | ARS | `,` | `.` |
| MX | MXN | `.` | `,` |
| CO | COP | `,` | `.` |
| PE | PEN | `.` | `,` |
| UY | UYU | `,` | `.` |
| BR | BRL | `,` | `.` |
| EC | USD | `.` | `,` |

### Comportamiento ADMIN-only en UI

- Decoder del JWT existente (probablemente en `lib/auth.ts` — verificar) para leer el `role`.
- Si `role !== 'ADMIN'`: renderizar mensaje "Solo administradores pueden modificar la configuración del restaurante" en lugar del form. No esconder la página entera (sirve para que el manager sepa qué configuración tiene activa).
- Mostrar los campos como **read-only** para no-ADMIN, no ocultar.

### Re-habilitar link en sidebar

`apps/ui/src/layouts/DashboardLayout.astro:19` — descomentar la entrada `{ href: '/dash/settings', label: 'Configuración' }`. Quitar el TODO.

Visibilidad del item del sidebar: visible para todos los roles (porque un MANAGER puede querer ver la config), pero la edición solo aplica para ADMIN. Esto es consistente con cómo se manejan otras secciones (no escondemos `/dash/orders` para BASIC, mostramos pero limitamos acciones).

### Invalidación de caché React Query

Después de un PATCH exitoso:

```ts
queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
```

Esto fuerza al wizard de creación de orden (y cualquier consumidor futuro de `useRestaurantSettings`) a re-fetch en la próxima interacción. Como el hook usa `staleTime: Infinity`, sin invalidación los cajeros con sesiones abiertas seguirían viendo el formato viejo hasta hard-refresh.

### Manejo de errores UI

Errores backend → mapear a mensajes en español:

| Código | Mensaje UI |
|---|---|
| `INVALID_SEPARATORS_DUPLICATE` | "El separador decimal y de miles deben ser distintos" |
| `IsIanaTimezone` validation | "Zona horaria inválida. Usa una de la lista o consulta IANA Time Zone Database" |
| 403 | "Solo administradores pueden modificar la configuración" |
| 404 | "No se encontró la configuración del restaurante. Contacta a soporte." |
| Red | "Error de conexión. Intenta nuevamente." |

---

## UX details

### Estados del form

- **Cargando:** spinner, inputs deshabilitados.
- **Cargado:** valores actuales preseleccionados (no campos vacíos), botón "Guardar" deshabilitado hasta que haya un cambio (dirty check).
- **Guardando:** botón deshabilitado con texto "Guardando..."; preview sigue funcionando con los valores del form.
- **Guardado:** toast verde "Configuración actualizada", botón vuelve a "Guardar" deshabilitado (form ya no está dirty).
- **Error:** toast/banner rojo arriba de la sección, inputs siguen editables.

### Confirmación para cambios sensibles

Cambiar timezone es operacionalmente significativo. **Modal de confirmación obligatorio** antes de PATCH:

> ⚠️ Cambiar la zona horaria afecta:
> - Reportes de cocina y cierre de caja.
> - Horarios disponibles de menús.
>
> Los registros históricos no se reescriben — solo cambia cómo se muestran fechas nuevas.
>
> ¿Confirmar cambio de `America/Santiago` a `America/Buenos_Aires`?

Para los demás campos no hace falta confirmación (son cosméticos).

---

## Implementation order

1. **Backend — endpoint + validators + tests** (~2-3h)
   - DTO + custom validator timezone
   - Service method con cross-field y cache invalidation
   - Repository methods
   - Unit + e2e tests
   - Actualizar `restaurants.module.info.md`

2. **Frontend — página settings** (~3-4h)
   - Reemplazar `dash/settings.astro` con la nueva estructura
   - 2 secciones con submit independiente
   - Live preview con `formatMoney`
   - Auto-fill por país (opcional, último)
   - Mapeo de errores
   - Modal de confirmación de timezone
   - Read-only mode para no-ADMIN
   - Invalidar React Query cache post-guardado

3. **Polish** (~30min)
   - Re-habilitar link en `DashboardLayout.astro`
   - Smoke test manual end-to-end (cambiar moneda → ver wizard reflejarlo sin refresh)
   - Actualizar `apps/ui/docs/` si existe doc del módulo

---

## Open questions

- **¿Mantener `kitchenToken` como campo editable acá?** Hoy se regenera via `POST /v1/kitchen/token/generate`. Si queremos un solo lugar para "todo lo del restaurante", podría tener sentido moverlo aquí. **Propuesta:** mantenerlo donde está (módulo `kitchen`) para no mezclar concerns, pero exponer un "Estado del token de cocina" read-only en esta página con link a la página específica.

- **¿Permitir editar el nombre del restaurante en esta misma página?** Hoy existe `PATCH /v1/restaurants/name` pero la UI no lo expone. Sería natural agregarlo como una sección 0 "Identidad". **Propuesta:** sí, agregarlo como tercera sección "Datos del restaurante" con nombre + (futuro: logo). No bloquea este spec.

- **¿Logging/auditoría de cambios?** Si un ADMIN cambia el timezone justo antes del cierre de caja, sería útil tener un audit log de "quién cambió qué cuándo". **Propuesta:** out of scope ahora. Si se necesita después, va en otro spec.

- **¿Validar que un `currency` corresponda con un `country`?** Ej. impedir CL + USD. **Propuesta:** no validar. Hay casos legítimos (restaurante en aeropuerto chileno que cobra USD). El admin sabe lo que hace.

---

## Verificación de aceptación

- [ ] Como ADMIN puedo cambiar el timezone desde `/dash/settings` y veo el modal de confirmación.
- [ ] Después de cambiar el timezone, los `displayOpenedAt` de futuros turnos reflejan la nueva TZ sin reiniciar el server.
- [ ] Como ADMIN puedo cambiar la moneda y los separadores, y el preview muestra el resultado en vivo.
- [ ] Después de guardar, abro `/dash/orders` → "Nuevo pedido" y veo los precios formateados con los nuevos separadores **sin hard-refresh**.
- [ ] Como MANAGER veo la página en modo read-only con el mensaje correcto.
- [ ] Como BASIC veo la página en modo read-only.
- [ ] Sin token, `/dash/settings` redirige a `/login` (comportamiento existente del layout).
- [ ] `decimalSeparator === thousandsSeparator` muestra error con código específico.
- [ ] `timezone` inválido (ej. `"foo/bar"`) muestra error específico.
- [ ] La sección "Reservas" rota desaparece de la página.
- [ ] El link `/dash/settings` está visible en el sidebar.
