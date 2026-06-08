# Diseño — R2-03: unificación del formato de dinero en todas las superficies

**Fecha:** 2026-06-08
**Hallazgo origen:** R2-03 en `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`
**Severidad:** 🟡 MEDIO (display; sin pérdida de dinero)
**Módulos UI:** `dash` (stats, caja, productos, menús, historial), `kiosk`. **Backend:** `kiosk` (status endpoint).
**Tipo:** Implementación

---

## Problema

El módulo de settings expone por restaurante `currency`, `decimalSeparator` y `thousandsSeparator`. Existe la función correcta `formatMoney(amount, settings)` en `apps/ui/src/lib/money.ts` (pura, testeada en `money.test.ts`), pero **solo la usan `OrderCard`, `CreateOrderStep1` y `CreateOrderStep3`**. El resto de las superficies de dinero formatean a mano (`toFixed(2)`, `toLocaleString('en-US', …)`, `formatCurrency` ad-hoc), ignorando los settings.

Para un restaurante CLP (`decimalSeparator=','`, `thousandsSeparator='.'`) lo correcto es `$1.234,50`, pero hoy se ve `$1234.50` (cierre de caja, historial) o `$1,234.50` (stats en vivo, formato US). El feature de settings quedó a medio cablear, incluido el reporte de cierre que es prioridad.

## Principio del fix

`formatMoney` ya existe, es agnóstica de framework (función pura) y está testeada. **No se crea nada nuevo**: se reusa en todas las superficies. Lo único que cambia por superficie es **cómo obtiene los separadores**, porque cada una tiene distinto acceso a los settings:

| Superficie | Fuente de separadores | Cambio necesario |
|---|---|---|
| Dashboard React (islas `client:load`) | `useRestaurantSettings()` (ya existe) | reemplazar formateadores ad-hoc |
| `orders-history.astro` (script estático) | `localStorage` (igual que el timezone) | guardar separadores en login + leerlos en el script |
| Kiosk (público, sin auth) | store del kiosk ← `/v1/kiosk/:slug/status` | backend expone separadores + store los guarda |

La separación número-vs-string se respeta: el dinero sigue cruzando el cable como **número** (el backend ya hace `fromCents`); el formato (string con `,`/`.`/`$`) ocurre en el cliente con `formatMoney`. Esto preserva el número para la UI optimista y los gráficos.

---

## Decisiones de diseño (aprobadas)

1. **`ShiftSummaryView`** (componente en `commons/`, siempre renderizado dentro de islas React) llama `useRestaurantSettings()` internamente, en vez de recibir `settings` por prop. No toca a sus padres (`RegisterPanel`, `RegisterHistoryIsland`, `RegisterSummaryModal`).
2. **Símbolo de moneda y decimales por moneda quedan FUERA de alcance.** `formatMoney` mantiene el `$` fijo y 2 decimales. El símbolo por `currency` (USD vs CLP) y los decimales por moneda (CLP/JPY sin decimales) son el hallazgo **R2-10**, con su propio fix. Acá solo se unifican los **separadores**.
3. **`orders-history.astro`** obtiene los separadores desde `localStorage`, consistente con cómo ya obtiene el timezone (`getRestaurantTimezone`). Para sesiones ya activas sin separadores en localStorage, cae al default CL (`,`/`.`) — mismo comportamiento que el timezone con UTC hasta el próximo login.

---

## Cambios

### Backend (kiosk)

1. **`apps/api-core/src/kiosk/kiosk.service.ts`** — `getStatus(slug)` devuelve además `decimalSeparator` y `thousandsSeparator` (el modelo `Restaurant` ya los tiene; `schema.postgresql.prisma:110-111`).
2. **`apps/api-core/src/kiosk/dto/*`** — `KioskStatusDto` agrega los dos campos (`@ApiProperty`).

### Plumbing de settings (frontend)

3. **`apps/ui/src/lib/auth.ts`** — agregar `setMoneyDisplaySettings(decimalSeparator, thousandsSeparator)` / `getMoneyDisplaySettings(): MoneyDisplaySettings` sobre `localStorage` (espejo de `setRestaurantTimezone`/`getRestaurantTimezone`); incluir las nuevas claves en `clearLocalAuthState`. El getter cae a `DEFAULT_MONEY_DISPLAY_SETTINGS` de `money.ts`.
4. **`apps/ui/src/pages/login.astro`** — tras el login, llamar `setMoneyDisplaySettings(...)` con los separadores de la respuesta de login. (Si la respuesta de login no los trae, leerlos vía el mismo `result` que ya trae `timezone`; ver "Riesgo" abajo.)
5. **`apps/ui/src/components/kiosk/store/kiosk.store.ts`** — guardar `decimalSeparator`/`thousandsSeparator` del `/status` en el estado del store (con default CL), y exponerlos a los componentes.

### Migración a `formatMoney` — Dashboard React

Cada uno reemplaza su formateador ad-hoc por `formatMoney(value, settings)` con `settings` de `useRestaurantSettings()`:

6. `apps/ui/src/components/commons/ShiftSummaryView.tsx` — borrar el `formatCurrency` local (`:83-86`); usar `formatMoney` en las 6 llamadas (`:174-176, :203, :251`).
7. `apps/ui/src/components/dash/orders/OrderStatsPanel.tsx` — borrar el `formatCurrency` local (`:9-11`, formato `en-US`); usar `formatMoney` (`:91, :97, :109`).
8. `apps/ui/src/components/dash/products/ProductsIsland.tsx` — reemplazar `${Number(...).toFixed(2)}` (`:78`).
9. `apps/ui/src/components/dash/menus/ProductPickerModal.tsx` — reemplazar `${Number(p.price).toFixed(2)}` (`:107`).
10. `apps/ui/src/components/dash/menus/MenuItemsSection.tsx` — reemplazar `${Number(item.product.price).toFixed(2)}` (`:70`).

### Migración a `formatMoney` — Astro estático

11. `apps/ui/src/pages/dash/orders-history.astro` — borrar el `formatCurrency` local (`:113-114`); `import { formatMoney }` y formatear con los separadores de `getMoneyDisplaySettings()`. Afecta `:186, :227, :228, :272`.

### Migración a `formatMoney` — Kiosk

Usar `formatMoney(value, settings)` con los separadores del store del kiosk:

12. `apps/ui/src/components/kiosk/ProductCard.tsx` — `:58, :70`.
13. `apps/ui/src/components/kiosk/CartPanel.tsx` — `:18`.
14. `apps/ui/src/components/kiosk/OrderSummaryItem.tsx` — `:31, :38`.
15. `apps/ui/src/components/kiosk/OrderConfirmation.tsx` — `:36, :39, :44`.

> **Nota de exploración:** el implementador debe correr un grep final (`toFixed`, `toLocaleString`, `formatCurrency`, ``$${``) sobre `apps/ui/src` para cazar cualquier display de dinero no listado (excluir `ProductForm.tsx:72`, que es tamaño de archivo en MB, no dinero).

---

## Tests

1. **Backend:** test de `kiosk.service.getStatus` (o e2e del endpoint) que verifique que la respuesta incluye `decimalSeparator`/`thousandsSeparator` del restaurante.
2. **`money.test.ts`:** ya cubre `formatMoney` (CL/MX/negativos/redondeo/no-finitos). Sin cambios salvo agregar casos si aparece un gap.
3. **Componentes migrados:** los tests de UI existentes (`OrderStatsPanel.test.tsx`, `OrdersPanel.test.tsx`, `RegisterSummaryModal.test.tsx`, etc.) deben seguir verdes; ajustar las aserciones de strings de dinero al formato de `formatMoney` (`$25.000,00` con default CL) donde corresponda.
4. **Regresión visual mínima (manual):** un restaurante CL ve `$1.234,50` en cierre de caja, stats en vivo, lista de productos, historial y kiosk.

---

## Riesgos / notas

- **Respuesta de login y separadores:** el paso 4 asume que la respuesta de login puede exponer los separadores (hoy ya expone `timezone`). Si no los trae, dos opciones: (a) agregarlos a la respuesta de login (backend `auth`), o (b) que `orders-history.astro` haga `fetch('/v1/restaurants/settings')` en el script (autenticado, ya devuelve separadores) en vez de localStorage. El plan debe verificar qué devuelve el login y elegir; preferencia: extender el login para mantener el patrón localStorage del timezone. **Decidir en el plan tras inspeccionar la respuesta de login.**
- **Endpoint público del kiosk:** exponer separadores es config de display, sin datos sensibles ni de otros tenants. Riesgo nulo.
- **Sesiones activas sin re-login:** caen al default CL hasta el próximo login (idéntico al timezone→UTC). Aceptable.

## Documentación al terminar (parte del entregable)

Estos pasos son parte del trabajo, no opcionales:

1. **Documentar la convención de display que ahora se aplica.** Crear `apps/ui/docs/money-formatting.md` que explique:
   - El dinero cruza el cable como **número en pesos** (el backend ya hace `fromCents`); el formato con separadores (`$1.234,50`) es **display en el cliente** vía `formatMoney(amount, settings)` de `lib/money.ts`.
   - La **regla única**: ninguna superficie formatea dinero a mano; todas usan `formatMoney`.
   - Las **3 fuentes de separadores** por tipo de superficie (tabla de arriba): hook `useRestaurantSettings()` (dashboard React), `localStorage` (`orders-history.astro`), store del kiosk (← `/v1/kiosk/:slug/status`).
   - Qué queda fuera (símbolo/decimales por moneda → R2-10).
2. **Crear el índice `apps/ui/docs/README.md`** (hoy no existe; lo exige la convención de docs del repo) listando los archivos de `apps/ui/docs/` (`common-components.md`, `environments.md`, el nuevo `money-formatting.md`).
3. **Enlazar desde el doc de conversión backend.** Agregar al final de `apps/api-core/docs/money-conversion.md` un puntero: "El formato de display (separadores por restaurante) vive en el frontend; ver `apps/ui/docs/money-formatting.md`." — así el doc de conversión backend (que termina en "el frontend recibe pesos") conecta con dónde sigue la historia.
4. **Marcar R2-03 RESUELTO** en `apps/api-core/docs/superpowers/specs/2026-06-07-orders-kiosk-money-audit-findings.md`: banner ✅ bajo el encabezado de R2-03, actualizar la línea `**Estado:**` y la tabla del resumen ejecutivo (MEDIO pasa de 4 a 3 pendientes; total a "3 resueltos, 9 pendientes"), igual que se hizo con R2-01 y R2-02, referenciando este diseño y su plan.

## Fuera de alcance (otros hallazgos)
- **R2-10** — símbolo por `currency` + decimales por moneda (minor units ISO 4217).
- **R2-09** — etiquetas confusas del selector de formato decimal en `RestaurantSettingsForm`.
