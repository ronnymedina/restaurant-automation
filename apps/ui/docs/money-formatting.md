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
