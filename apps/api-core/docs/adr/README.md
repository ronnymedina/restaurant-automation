# ADRs — apps/api-core

Architecture Decision Records: registro inmutable de decisiones arquitectónicas significativas para el módulo `apps/api-core`.

## Convenciones MADR

- **Formato:** MADR (Markdown Architectural Decision Records) en español.
- **Secciones obligatorias:** Contexto, Decisión, Consecuencias positivas, Consecuencias negativas, Alternativas consideradas, Referencias.
- **Estados válidos:** `Propuesto` | `Aceptado` | `Superseded` | `Deprecado`.
- **Inmutabilidad:** un ADR aceptado no se edita. Cambios o reversiones generan un nuevo ADR que supersede al anterior.
- **Un folder por proyecto:** cada app (`api-core`, `ui`, etc.) mantiene su propio directorio `docs/adr/` independiente.
- **Numeración:** secuencial de 4 dígitos (`0001-`, `0002-`, …), nombre kebab-case descriptivo.

## ADRs activos

| # | Título | Estado | Fecha |
|---|--------|--------|-------|
| 0001 | [Autenticación por cookies httpOnly](./0001-cookie-httponly-auth.md) | Aceptado | 2026-05-30 |
| 0002 | [PostgreSQL como única base de datos](./0002-postgresql-unica-base-de-datos.md) | Aceptado | 2026-06-13 |
| 0003 | [Modelo monetario: centavos (BigInt) y currency-agnostic](./0003-modelo-monetario-centavos-bigint.md) | Aceptado | 2026-06-13 |
| 0004 | [Presentación localizada por restaurante: timezone y separadores](./0004-presentacion-localizada-por-restaurante.md) | Aceptado | 2026-06-13 |
| 0005 | [Roles y autorización](./0005-roles-y-autorizacion.md) | Aceptado | 2026-06-13 |
| 0006 | [Ciclo de vida del pedido: kiosk, dashboard y cocina](./0006-ciclo-de-vida-del-pedido.md) | Aceptado | 2026-06-13 |
| 0007 | [Contrato de error unificado de la API](./0007-contrato-de-error-unificado.md) | Aceptado | 2026-06-14 |

## Históricos (pre-numeración MADR)

Documentos anteriores al estándar MADR, conservados por historia pero no en formato canónico:

- [`2026-03-08-refactor-modules-design.md`](./2026-03-08-refactor-modules-design.md) — diseño de refactor de módulos (marzo 2026).
- [`2026-03-09-auto-print-on-order.md`](./2026-03-09-auto-print-on-order.md) — decisión de impresión automática al crear pedido.
- [`2026-03-09-kitchen-display.md`](./2026-03-09-kitchen-display.md) — decisión de pantalla de cocina (KDS).

> **Nota:** ADR 0006 consolida y supersede `2026-03-09-auto-print-on-order.md` y `2026-03-09-kitchen-display.md`.
