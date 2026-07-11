# R2-03 — Unificación del formato de dinero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que TODAS las superficies de dinero (dashboard, historial, caja, productos, menús, kiosk) muestren los montos con los separadores del restaurante usando la función compartida `formatMoney`, en vez de formatear a mano.

**Architecture:** El dinero cruza el cable como número en pesos (el backend ya hace `fromCents`). El formato con separadores (`$1.234,50`) es display en el cliente vía `formatMoney(amount, settings)` (`apps/ui/src/lib/money.ts`, ya existe y testeado). Cada superficie obtiene los separadores de una fuente distinta: hook `useRestaurantSettings()` (dashboard React), `localStorage` (`orders-history.astro` estático), store del kiosk (← endpoint público `/status`).

**Tech Stack:** NestJS + Prisma (kiosk/auth), Astro + React + Zustand (UI), Jest (backend), Vitest (UI).

**Comandos de test:**
- Backend (en contenedor): `docker compose exec res-api-core pnpm test <patrón>` / `pnpm test:e2e <patrón>`
- UI: `docker compose exec res-ui pnpm test` (vitest) o desde `apps/ui/`: `pnpm test`
- Build UI: `docker compose exec res-ui pnpm build`

**Diseño de referencia:** `apps/ui/docs/superpowers/specs/2026-06-08-money-format-unification-design.md`

**Patrón canónico React** (ya usado en `CreateOrderStep1.tsx:6-7,64-65`):
```tsx
import { useRestaurantSettings } from '../../../lib/restaurant-settings'; // ajustar profundidad
import { formatMoney } from '../../../lib/money';
// dentro del componente:
const { data: settings } = useRestaurantSettings();
const formatPrice = (amount: number) => formatMoney(amount, settings);
// uso: {formatPrice(value)}
```

---

## File Structure

| Archivo | Responsabilidad | Cambio |
|---|---|---|
| `api-core/src/kiosk/kiosk.service.ts` | status público | devolver separadores |
| `api-core/src/kiosk/dto/kiosk-response.dto.ts` | DTO status | 2 campos nuevos |
| `api-core/src/auth/auth.service.ts` | login/refresh | devolver separadores |
| `ui/src/lib/auth.ts` | persistencia local | helpers de separadores en localStorage |
| `ui/src/pages/login.astro` | login | guardar separadores |
| `ui/src/components/kiosk/store/kiosk.store.ts` + `types/kiosk.types.ts` | estado kiosk | guardar separadores del status |
| Componentes React dashboard (5) | display | usar `formatMoney` |
| `ui/src/pages/dash/orders-history.astro` | display estático | usar `formatMoney` + localStorage |
| Componentes kiosk (4) | display | usar `formatMoney` |
| `ui/docs/money-formatting.md` + `ui/docs/README.md` + `api-core/docs/money-conversion.md` | docs | convención + índice + link |
| `api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md` | hallazgos | marcar R2-03 resuelto |

---

## Task 1: Backend — kiosk `/status` devuelve separadores

**Files:**
- Modify: `apps/api-core/src/kiosk/kiosk.service.ts:60-63`
- Modify: `apps/api-core/src/kiosk/dto/kiosk-response.dto.ts:3-8`
- Test: `apps/api-core/src/kiosk/kiosk.service.spec.ts` (o crear si no existe)

- [ ] **Step 1: Test (rojo)** — agregar/crear un test que verifique que `getStatus` incluye los separadores del restaurante.

Primero leé `getStatus` y cómo obtiene `restaurant` (qué campos trae `findBySlug`/equivalente). Asegurate de que el restaurante cargado incluya `decimalSeparator`/`thousandsSeparator` (si viene de `settings`, ajustá la query/select). Test esperado (adaptá el mock al patrón del spec existente):
```ts
it('getStatus incluye los separadores de display del restaurante', async () => {
  // mock restaurant con decimalSeparator ',' y thousandsSeparator '.'
  const result = await service.getStatus('mi-slug');
  expect(result).toMatchObject({
    decimalSeparator: ',',
    thousandsSeparator: '.',
  });
});
```
Run: `docker compose exec res-api-core pnpm test kiosk.service` → FAIL.

- [ ] **Step 2: Implementar** — en `getStatus`, devolver los separadores. Si `restaurant` no los trae, ampliar el select para incluir `decimalSeparator` y `thousandsSeparator` (campos del modelo `Restaurant`, `schema.postgresql.prisma:110-111`):
```ts
return {
  registerOpen: !!session,
  restaurantName: restaurant.name,
  decimalSeparator: restaurant.decimalSeparator,
  thousandsSeparator: restaurant.thousandsSeparator,
};
```

- [ ] **Step 3: DTO** — en `kiosk-response.dto.ts`, agregar a `KioskStatusDto`:
```ts
  @ApiProperty({ example: ',' })
  decimalSeparator: string;

  @ApiProperty({ example: '.' })
  thousandsSeparator: string;
```

- [ ] **Step 4: Verde** — Run: `docker compose exec res-api-core pnpm test kiosk.service` → PASS. Si hay e2e de kiosk status, correr `docker compose exec res-api-core pnpm test:e2e kiosk` y ajustar aserciones.

- [ ] **Step 5: Commit**
```bash
git add apps/api-core/src/kiosk
git commit -m "feat(kiosk): expose display separators in public /status (R2-03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — login/refresh devuelven separadores

**Files:**
- Modify: `apps/api-core/src/auth/auth.service.ts:72,113`
- Test: `apps/api-core/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Test (rojo)** — agregar al spec de auth una aserción de que la respuesta de `login` incluye `decimalSeparator`/`thousandsSeparator` desde `restaurant.settings`. Seguí el patrón del test existente que verifica `timezone`. Run: `docker compose exec res-api-core pnpm test auth.service` → FAIL.

- [ ] **Step 2: Implementar** — en `login` (línea 72) y `refreshTokens` (línea 113), extender el return:
```ts
return {
  accessToken,
  refreshToken,
  timezone: restaurant.settings?.timezone ?? 'UTC',
  decimalSeparator: restaurant.settings?.decimalSeparator ?? ',',
  thousandsSeparator: restaurant.settings?.thousandsSeparator ?? '.',
};
```
(Si hay un DTO de respuesta de login con `@ApiProperty`, agregar también los dos campos ahí.)

- [ ] **Step 3: Verde** — Run: `docker compose exec res-api-core pnpm test auth.service` → PASS.

- [ ] **Step 4: Commit**
```bash
git add apps/api-core/src/auth
git commit -m "feat(auth): return display separators on login/refresh (R2-03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend — plumbing de separadores (auth.ts + login.astro)

**Files:**
- Modify: `apps/ui/src/lib/auth.ts`
- Modify: `apps/ui/src/pages/login.astro:163`

- [ ] **Step 1: Helpers en `auth.ts`** — agregar, importando el tipo y default de `money.ts`:
```ts
import type { MoneyDisplaySettings } from './money';
import { DEFAULT_MONEY_DISPLAY_SETTINGS } from './money';

const DECIMAL_SEP_KEY = 'restaurantDecimalSeparator';
const THOUSANDS_SEP_KEY = 'restaurantThousandsSeparator';

export function setMoneyDisplaySettings(decimalSeparator: string, thousandsSeparator: string): void {
  localStorage.setItem(DECIMAL_SEP_KEY, decimalSeparator);
  localStorage.setItem(THOUSANDS_SEP_KEY, thousandsSeparator);
}

export function getMoneyDisplaySettings(): MoneyDisplaySettings {
  return {
    decimalSeparator: localStorage.getItem(DECIMAL_SEP_KEY) ?? DEFAULT_MONEY_DISPLAY_SETTINGS.decimalSeparator,
    thousandsSeparator: localStorage.getItem(THOUSANDS_SEP_KEY) ?? DEFAULT_MONEY_DISPLAY_SETTINGS.thousandsSeparator,
  };
}
```
Y en `clearLocalAuthState`, agregar el removeItem de ambas claves:
```ts
  localStorage.removeItem(DECIMAL_SEP_KEY);
  localStorage.removeItem(THOUSANDS_SEP_KEY);
```

- [ ] **Step 2: login.astro** — importar `setMoneyDisplaySettings` y llamarlo tras `setRestaurantTimezone` (línea ~163):
```ts
import { isAuthenticated, setRestaurantTimezone, setMoneyDisplaySettings } from '../lib/auth';
// ...
setRestaurantTimezone(result.timezone ?? 'UTC');
setMoneyDisplaySettings(result.decimalSeparator ?? ',', result.thousandsSeparator ?? '.');
```

- [ ] **Step 3: Verificar build** — Run: `docker compose exec res-ui pnpm build` → sin errores.

- [ ] **Step 4: Commit**
```bash
git add apps/ui/src/lib/auth.ts apps/ui/src/pages/login.astro
git commit -m "feat(ui): persist restaurant money separators at login (R2-03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Dashboard React — migrar 5 componentes a `formatMoney`

**Files (todos React, usan `useRestaurantSettings()`):**
- `apps/ui/src/components/commons/ShiftSummaryView.tsx`
- `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx`
- `apps/ui/src/components/dash/products/ProductsIsland.tsx:78`
- `apps/ui/src/components/dash/menus/ProductPickerModal.tsx:107`
- `apps/ui/src/components/dash/menus/MenuItemsSection.tsx:70`
- Tests: los `*.test.tsx` correspondientes

> Para cada archivo: leer el componente, agregar los imports (`useRestaurantSettings`, `formatMoney`) ajustando la profundidad relativa de la ruta, obtener `settings` con el hook, y reemplazar el formateador ad-hoc. Si el componente no es un componente (p.ej. una función helper fuera del cuerpo React), pasar `settings` como argumento desde el cuerpo.

- [ ] **Step 1: ShiftSummaryView.tsx** — borrar la función local `formatCurrency` (`:83-86`). Dentro de `ShiftSummaryView`, agregar `const { data: settings } = useRestaurantSettings();` y `const formatCurrency = (v: number | null | undefined) => formatMoney(Number(v ?? 0), settings);`. Mantener las 6 llamadas (`:174-176, :203, :251`). Agregar imports.

- [ ] **Step 2: OrderStatsPanel.tsx** — borrar la función local `formatCurrency` (`:9-11`, formato `en-US`). Dentro del componente agregar el hook y `const formatCurrency = (v: number) => formatMoney(v, settings);`. Mantener `:91,97,109`. Agregar imports.

- [ ] **Step 3: ProductsIsland.tsx** — reemplazar `${Number(getValue<number>()).toFixed(2)}` (`:78`) por `{formatMoney(Number(getValue<number>()), settings)}` con `settings` del hook (agregar el hook en el componente; si `:78` está en una celda de tabla definida fuera del cuerpo, pasar `settings` por contexto/closure — leer el archivo para decidir).

- [ ] **Step 4: ProductPickerModal.tsx** — reemplazar `${Number(p.price).toFixed(2)}` (`:107`) por `{formatMoney(Number(p.price), settings)}`, hook en el componente.

- [ ] **Step 5: MenuItemsSection.tsx** — reemplazar `${Number(item.product.price).toFixed(2)}` (`:70`) por `{formatMoney(Number(item.product.price), settings)}`, hook en el componente.

- [ ] **Step 6: Tests** — correr la suite UI y ajustar las aserciones de strings de dinero al formato `formatMoney` con default CL (`$25.000,00`):
```
docker compose exec res-ui pnpm test
```
Ajustar `OrderStatsPanel.test.tsx`, `RegisterSummaryModal.test.tsx`, y cualquier test de productos/menús que asierte montos. (Nota: `RegisterPanel.test.tsx` tiene 12 fallas PREEXISTENTES no relacionadas — verificar que siguen siendo las mismas, no introducir nuevas.) Los tests deben quedar verdes salvo esas preexistentes.

- [ ] **Step 7: Commit**
```bash
git add apps/ui/src/components/commons/ShiftSummaryView.tsx apps/ui/src/components/dash/orders/OrderStatsPanel.tsx apps/ui/src/components/dash/products/ProductsIsland.tsx apps/ui/src/components/dash/menus/ProductPickerModal.tsx apps/ui/src/components/dash/menus/MenuItemsSection.tsx
git add apps/ui/src/components/**/*.test.tsx
git commit -m "fix(ui): use shared formatMoney in dashboard money displays (R2-03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Astro estático — `orders-history.astro`

**Files:**
- Modify: `apps/ui/src/pages/dash/orders-history.astro` (`:113-114,186,227,228,272`)

- [ ] **Step 1: Importar y formatear con localStorage** — en el `<script>` del cliente, importar `formatMoney` y `getMoneyDisplaySettings`, y reemplazar la `formatCurrency` local (`:113-114`):
```ts
import { formatMoney } from '../../lib/money';
import { getMoneyDisplaySettings } from '../../lib/auth';
// ...
const moneySettings = getMoneyDisplaySettings();
function formatCurrency(value: number): string {
  return formatMoney(Number(value), moneySettings);
}
```
(El resto de las llamadas `:186,227,228,272` ya usan `formatCurrency`, no se tocan.)

- [ ] **Step 2: Verificar build** — Run: `docker compose exec res-ui pnpm build` → sin errores; confirmar que el import en el script de Astro compila.

- [ ] **Step 3: Commit**
```bash
git add apps/ui/src/pages/dash/orders-history.astro
git commit -m "fix(ui): format order-history money with restaurant separators (R2-03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Kiosk — store + 4 componentes

**Files:**
- Modify: `apps/ui/src/components/kiosk/types/kiosk.types.ts` (`KioskStore`)
- Modify: `apps/ui/src/components/kiosk/store/kiosk.store.ts` (`initialState`, `init`)
- Modify: `apps/ui/src/components/kiosk/ProductCard.tsx` (`:58,70`)
- Modify: `apps/ui/src/components/kiosk/CartPanel.tsx` (`:18`)
- Modify: `apps/ui/src/components/kiosk/OrderSummaryItem.tsx` (`:31,38`)
- Modify: `apps/ui/src/components/kiosk/OrderConfirmation.tsx` (`:36,39,44`)

- [ ] **Step 1: Tipo `KioskStore`** — en `kiosk.types.ts`, agregar al type `KioskStore` (cerca de `restaurantName`):
```ts
  decimalSeparator: string
  thousandsSeparator: string
```

- [ ] **Step 2: Store** — en `kiosk.store.ts`:
  - `initialState`: agregar `decimalSeparator: ',', thousandsSeparator: '.',`.
  - En `init`, dentro del `if (res.ok)`, guardar los separadores del status:
```ts
        sessionOpen = data.registerOpen
        set({
          restaurantName: data.restaurantName ?? '',
          decimalSeparator: data.decimalSeparator ?? ',',
          thousandsSeparator: data.thousandsSeparator ?? '.',
        })
```

- [ ] **Step 3: Componentes kiosk** — en cada uno, leer los separadores del store y formatear con `formatMoney`. Patrón (ajustar profundidad de ruta — desde `components/kiosk/` es `../../lib/money`):
```tsx
import { formatMoney } from '../../lib/money';
import { useKioskStore } from './store/kiosk.store'; // si no está ya importado
// dentro del componente:
const decimalSeparator = useKioskStore((s) => s.decimalSeparator);
const thousandsSeparator = useKioskStore((s) => s.thousandsSeparator);
const fmt = (v: number) => formatMoney(v, { decimalSeparator, thousandsSeparator });
```
Reemplazos exactos:
  - `ProductCard.tsx:58` `Antes ${oldPrice.toFixed(2)}` → `Antes {fmt(oldPrice)}`; `:70` `${price.toFixed(2)}` → `{fmt(price)}`.
  - `CartPanel.tsx:18` `${total.toFixed(2)}` → `{fmt(total)}`.
  - `OrderSummaryItem.tsx:31` `${(item.oldPrice * item.quantity).toFixed(2)}` → `{fmt(item.oldPrice * item.quantity)}`; `:38` análogo con `item.price`.
  - `OrderConfirmation.tsx:36` `${item.price.toFixed(2)}` → `{fmt(item.price)}` (mantener `{item.quantity} × `); `:39` `${(item.price * item.quantity).toFixed(2)}` → `{fmt(item.price * item.quantity)}`; `:44` `${total.toFixed(2)}` → `{fmt(total)}`.

> Si algún componente kiosk recibe `price` por props y no tiene acceso directo al store, leer los separadores en el componente padre que sí usa el store y pasarlos hacia abajo, o leer el store directo (es global). Leer cada archivo para decidir lo más limpio.

- [ ] **Step 4: Tests + build** — Run: `docker compose exec res-ui pnpm test` (ajustar tests de kiosk que asierten montos al formato `formatMoney`) y `docker compose exec res-ui pnpm build`.

- [ ] **Step 5: Commit**
```bash
git add apps/ui/src/components/kiosk
git commit -m "fix(kiosk): format prices with restaurant separators via formatMoney (R2-03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Documentación + marcar R2-03 resuelto

**Files:**
- Create: `apps/ui/docs/money-formatting.md`
- Create: `apps/ui/docs/README.md`
- Modify: `apps/api-core/docs/money-conversion.md` (final)
- Modify: `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`

- [ ] **Step 1: `money-formatting.md`** — crear con este contenido:
```markdown
# Formato de dinero en la UI (display)

El dinero cruza el cable como **número en pesos** (el backend convierte de centavos
con `fromCents`; ver `apps/api-core/docs/money-conversion.md`). El formato con
separadores (`$1.234,50`) es **display en el cliente**.

## Regla única

Ninguna vista formatea dinero a mano (`toFixed`, `toLocaleString`, plantillas `$${...}`).
Todas usan `formatMoney(amount, settings)` de `apps/ui/src/lib/money.ts`, donde
`settings` aporta `decimalSeparator`/`thousandsSeparator` del restaurante.

## Fuentes de separadores por tipo de superficie

| Superficie | Cómo obtiene los separadores |
|---|---|
| Dashboard React (islas `client:load`) | hook `useRestaurantSettings()` (`lib/restaurant-settings.ts`) |
| Páginas Astro estáticas (`orders-history.astro`) | `getMoneyDisplaySettings()` desde `localStorage` (`lib/auth.ts`), guardado en el login |
| Kiosk (público, sin auth) | store del kiosk, poblado desde `GET /v1/kiosk/:slug/status` |

## Fuera de alcance

- Símbolo por moneda (USD vs CLP) y decimales por moneda (CLP/JPY sin decimales):
  hallazgo R2-10. Hoy `formatMoney` usa `$` fijo y 2 decimales.
```

- [ ] **Step 2: `README.md` índice** — crear `apps/ui/docs/README.md`:
```markdown
# Documentación de `apps/ui`

- [common-components.md](common-components.md) — componentes compartidos de la UI.
- [environments.md](environments.md) — variables de entorno del frontend.
- [money-formatting.md](money-formatting.md) — convención de formato de dinero (separadores por restaurante).
```

- [ ] **Step 3: Link desde `money-conversion.md`** — agregar al final del archivo:
```markdown

## Display en el frontend

El backend entrega los montos en pesos (número). El **formato de display** (separadores
por restaurante, `$1.234,50`) vive en el frontend: ver `apps/ui/docs/money-formatting.md`.
```

- [ ] **Step 4: Marcar R2-03 RESUELTO** en `2026-06-07-orders-kiosk-money-audit-findings.md`:
  - Bajo el encabezado `### R2-03 — ...`, insertar el banner:
```markdown

> ✅ **RESUELTO (2026-06-08).** Todas las superficies de dinero (dashboard, historial, caja, productos, menús, kiosk) usan la función compartida `formatMoney` con los separadores del restaurante. El kiosk los recibe vía el endpoint público `/status`; el `orders-history.astro` vía localStorage (espejo del timezone); el dashboard vía `useRestaurantSettings()`. Convención documentada en `apps/ui/docs/money-formatting.md`. Ver `apps/ui/docs/superpowers/specs/2026-06-08-money-format-unification-design.md` y su plan. La descripción de abajo se conserva como registro del hallazgo original.
```
  - En la línea `**Estado:**` (~línea 8), añadir: ` R2-03 (MEDIO) RESUELTO el 2026-06-08.`
  - En el resumen ejecutivo, actualizar la fila MEDIO y el total:
```markdown
| 🟡 MEDIO | 4 | ~~R2-02~~ ✅, ~~R2-03~~ ✅ RESUELTOS, R2-04, R2-05 |
| 🟢 BAJO | 7 | R2-06, R2-07, R2-08, R2-09, R2-10, R2-11, R2-12 |
| **Total** | **12** (3 resueltos, 9 pendientes) | |
```
  (Leer la tabla actual primero para respetar el formato exacto de columnas.)

- [ ] **Step 5: Commit**
```bash
git add apps/ui/docs/money-formatting.md apps/ui/docs/README.md apps/api-core/docs/money-conversion.md apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md
git commit -m "docs: money-formatting convention + mark R2-03 resolved (R2-03)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Verificación final

- [ ] **Step 1: No quedan formateadores ad-hoc de dinero** — Run:
```bash
grep -rn "toFixed(2)\|toLocaleString('en-US'\|toLocaleString(\"en-US\"" apps/ui/src --include="*.tsx" --include="*.astro" | grep -v "money.ts"
```
Expected: solo el uso interno de `lib/money.ts` y casos no-dinero (p.ej. `ProductForm.tsx:72` tamaño en MB, `money.ts:34`). Cualquier otro display de dinero debe haber migrado.

- [ ] **Step 2: Build + tests UI** — Run:
```bash
docker compose exec res-ui pnpm build
docker compose exec res-ui pnpm test
```
Expected: build OK; tests verdes salvo las 12 fallas preexistentes de `RegisterPanel.test.tsx`.

- [ ] **Step 3: Suites backend tocadas** — Run:
```bash
docker compose exec res-api-core pnpm test kiosk auth
```
Expected: PASS.

- [ ] **Step 4: Verificación manual (anotar resultado)** — con un restaurante CL, confirmar `$1.234,50` en: cierre de caja, stats en vivo, lista de productos, historial de órdenes, y kiosk (precio de producto + carrito + confirmación).
```
