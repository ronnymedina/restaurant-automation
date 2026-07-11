# ADR 0004 — Presentación localizada por restaurante: timezone y separadores

**Estado:** Aceptado
**Fecha:** 2026-06-13

## Contexto

La plataforma es multi-tenant: distintos restaurantes operan en zonas horarias y países
diferentes, con convenciones locales de formato distintas (punto vs coma como separador
decimal, símbolo de moneda, etc.). Un locale fijo global no sirve. El backend expone números
crudos en pesos; el formato final de presentación es responsabilidad del cliente.

## Decisión

La presentación es **configuración por restaurante** en el modelo `RestaurantSettings`:

| Campo | Default | Propósito |
|---|---|---|
| `timezone` | `UTC` | Zona horaria para formatear fechas |
| `decimalSeparator` | `,` | Separador decimal en displays de dinero |
| `thousandsSeparator` | `.` | Separador de miles en displays de dinero |
| `currency` | — | Etiqueta de moneda (display); sin lógica monetaria |

Reglas de aplicación:

- **Fechas:** se almacenan en UTC (ISO 8601). Se formatean al timezone del restaurante
  **en servidor** mediante `TimezoneService` → `displayTime` incluido en las respuestas
  de órdenes.
- **Dinero:** cruza el cable en pesos decimales (ver ADR 0003). El formato con separadores
  (p. ej. `$1.234,50`) es **display en el cliente** vía `formatMoney(amount, settings)`.
- **Configuración:** editable en `/dash/settings`; endpoints `GET /v1/restaurants/settings`
  (todos los roles autenticados) y `PATCH /v1/restaurants/settings` (solo `ADMIN`).

La UI obtiene los separadores del restaurante actual a través de tres mecanismos según
la superficie:
- Dashboard: hook React / store de contexto.
- Páginas Astro estáticas: `localStorage` con los settings cacheados.
- Kiosk: store del kiosk cargado al inicio de la sesión.

## Consecuencias positivas

- Ninguna vista formatea dinero a mano con valores hardcoded.
- El modelo soporta cualquier combinación de separadores sin cambios de código.
- `displayTime` viene server-side: la pantalla de cocina y el dashboard muestran la hora
  local sin lógica de timezone en el cliente.

## Consecuencias negativas

- La UI obtiene los separadores de tres fuentes distintas según la superficie (hook,
  `localStorage`, store), lo que añade complejidad de sincronización entre ellas.
- Si `RestaurantSettings` no está configurado, se aplican los defaults (`UTC`, `,`, `.`),
  que pueden no coincidir con la convención del restaurante hasta que el ADMIN los configura.

## Alternativas consideradas

- **Locale fijo global** (rechazado): incompatible con la naturaleza multi-tenant; un solo
  restaurante por locale forzaría la elección a nivel de plataforma, no de negocio.
- **Formateo íntegro en backend** (rechazado): el backend ya expone los números crudos en
  pesos; añadir lógica de formato en el servidor duplicaría la capa de presentación y
  acoplaría el API a decisiones de UI.

## Referencias

- Guía de presentación de dinero: `apps/ui/docs/money-formatting.md`.
- Configuración de settings: `apps/ui/src/pages/dash/settings.astro` y
  `apps/ui/src/components/dash/RestaurantSettingsForm`.
- Modelo de datos: `RestaurantSettings` en `prisma/schema.postgresql.prisma`.
- Modelo monetario subyacente: ADR 0003.
