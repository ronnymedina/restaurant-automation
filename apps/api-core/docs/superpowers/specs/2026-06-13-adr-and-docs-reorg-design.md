# Diseño: ADRs (MADR) + reorganización de documentación

**Fecha:** 2026-06-13
**Estado:** Propuesto
**Alcance:** documentación de `apps/api-core` y `apps/ui`, más limpieza del root `docs/`.

---

## Objetivo

1. Adoptar formalmente un estándar ADR (MADR) ya en uso de facto en el repo.
2. Crear ADRs para las decisiones de configuración y gestión más relevantes a nivel de
   diseño (dinero, fechas/separadores, roles/permisos, base de datos, flujo de pedidos).
3. Reorganizar la documentación existente: cada proyecto mantiene su propio folder `adr/`
   y sus docs; mover docs legacy del root bajo el app que corresponde.
4. Eliminar documentación obsoleta del modelo híbrido SQLite/PostgreSQL, preservando todo
   lo relacionado al sistema de licencias / desktop (producto futuro).

## No objetivos

- No mover `docs/superpowers/` (planes/specs históricos): es el rastro de trabajo que las
  skills gestionan por convención; moverlo rompería decenas de referencias internas.
- No renumerar los ADRs históricos pre-MADR (se conservan con su nombre fechado).
- No reescribir el contenido técnico de los `.info.md` ni de `money-conversion.md`: los
  ADRs **registran la decisión** y referencian esos docs como guía de implementación.

---

## 1. Estándar ADR: MADR

Se adopta **MADR (Markdown Any Decision Records)** — https://adr.github.io/madr/ — variante
del catálogo https://github.com/architecture-decision-record/architecture-decision-record.

Razón: `apps/api-core/docs/adr/0001-cookie-httponly-auth.md` **ya** sigue MADR en español
(Contexto, Decisión, Consecuencias positivas/negativas, Alternativas consideradas,
Referencias) con numeración secuencial `NNNN-kebab.md`. Adoptarlo formaliza lo existente.

### Convenciones (a documentar en el README de ADRs)

- Numeración secuencial de 4 dígitos: `0001-`, `0002-`, …
- Nombre kebab-case descriptivo en español.
- Secciones MADR: **Estado**, **Fecha**, **Contexto**, **Decisión**, **Consecuencias**
  (positivas/negativas), **Alternativas consideradas**, **Referencias**.
- Estados válidos: `Propuesto` → `Aceptado` → (`Superseded por NNNN` | `Deprecado`).
- Inmutable una vez aceptado: un cambio de decisión se registra como **nuevo** ADR que
  supersede el anterior.
- Un folder `adr/` **por proyecto** (`apps/<app>/docs/adr/`). Hoy solo `apps/api-core`
  tiene decisiones de este tipo.

---

## 2. ADRs nuevos (en `apps/api-core/docs/adr/`)

Continúan la numeración desde `0001`. Cada ADR registra la decisión y enlaza a la guía de
implementación existente; no duplica su contenido.

### ADR 0002 — PostgreSQL como única base de datos

- **Contexto:** se barajó un modelo híbrido (SQLite self-hosted local + PostgreSQL cloud)
  vía provider dinámico de Prisma. Mantener dos motores duplica migraciones, schemas y
  superficie de prueba.
- **Decisión:** la plataforma es cloud-only SaaS sobre **PostgreSQL** como único motor.
  Schema canónico: `prisma/schema.postgresql.prisma`. El modelo híbrido queda descartado.
- **Consecuencias:** una sola cadena de migraciones; montos `BigInt` nativos sin la capa de
  compat del driver SQLite; se elimina la necesidad del script selector de schema y de
  `DATABASE_PROVIDER`. El self-hosted con SQLite, si alguna vez se retoma, requeriría un
  nuevo ADR.
- **Alternativas:** provider dinámico SQLite/Postgres (rechazado: doble mantenimiento);
  LibSQL/Turso vía driverAdapters (no necesario hoy).
- **Referencias:** supersede `docs/different-db-in-local-vs-cloud.md` y
  `apps/api-core/docs/pending/dynamic-database-provider.md` (ambos eliminados en esta pasada).

### ADR 0003 — Modelo monetario: centavos (BigInt) y currency-agnostic

- **Contexto:** los floats pierden precisión; se necesita aritmética monetaria exacta y un
  modelo simple para múltiples monedas.
- **Decisión:** todos los montos se almacenan como `BigInt` en **centavos** (factor ×100
  fijo). Conversión solo en los bordes: `toCents` en `@Transform` de DTOs (entrada),
  `fromCents` en `@Transform` de serializers (salida). El dominio nunca opera en decimal.
  El sistema es **currency-agnostic**: siempre 2 decimales internos, sin respetar minor
  units de ISO 4217; `currency` de `RestaurantSettings` es solo etiqueta de display.
- **Consecuencias:** sin errores de coma flotante; el frontend siempre envía/recibe pesos
  decimales; JSON expone números (no BigInt). Una moneda sin decimales (CLP/JPY) igual se
  almacena/renderiza con 2 decimales (cambio futuro sería solo de la capa display).
- **Referencias:** guía de implementación `apps/api-core/docs/money-conversion.md`;
  display en `apps/ui/docs/money-formatting.md`. (audit R2-10, R2-06, H-01)

### ADR 0004 — Presentación localizada por restaurante: timezone y separadores

- **Contexto:** distintos restaurantes muestran fechas y dinero con convenciones distintas
  (punto vs coma, zona horaria local).
- **Decisión:** la presentación es **configuración por restaurante** en `RestaurantSettings`:
  `timezone` (default `UTC`), `decimalSeparator` (default `,`), `thousandsSeparator`
  (default `.`), `currency` (etiqueta). Las fechas se almacenan en UTC (ISO8601) y se
  formatean al timezone del restaurante **server-side** (`displayTime` vía
  `TimezoneService`). El dinero cruza el cable en pesos; el formato con separadores
  (`$1.234,50`) es **display en cliente** vía `formatMoney(amount, settings)`. Configurable
  en `/dash/settings`; endpoint `GET/PATCH /v1/restaurants/settings` (PATCH solo ADMIN).
- **Consecuencias:** ninguna vista formatea dinero a mano; la UI obtiene separadores por
  superficie (hook React, `localStorage` en páginas Astro, store del kiosk).
- **Referencias:** `apps/ui/docs/money-formatting.md`,
  `apps/ui/src/components/dash/RestaurantSettingsForm`, modelo `RestaurantSettings`.

### ADR 0005 — Roles y autorización

- **Contexto:** staff con distintos niveles de acceso; multi-tenant por restaurante.
- **Decisión:** tres roles jerárquicos `ADMIN > MANAGER > BASIC` (enum Prisma `Role`).
  `JwtAuthGuard` global valida el access token (cookie httpOnly, ver ADR 0001); `RolesGuard`
  aplica `@Roles(...)`; **ADMIN bypassa** todos los checks de rol. `@Public()` marca rutas
  sin auth (kiosk). El `restaurantId` **siempre** sale del JWT — nunca del cliente; los
  endpoints de configuración son ADMIN-only.
- **Matriz de permisos** (derivada de los `@Roles` en los controllers): lectura de catálogo
  y órdenes para los tres roles; escritura de catálogo/menús/órdenes y cobro/cancelación
  para ADMIN+MANAGER; gestión de usuarios, settings del restaurante y token de cocina
  ADMIN-only. (Tabla completa en el cuerpo del ADR.)
- **Consecuencias:** BASIC puede operar el día a día (ver/crear) pero no administrar; el
  aislamiento multi-tenant no depende de input del cliente.
- **Referencias:** `src/common` (guards/decorators), `src/users`, ADR 0001.

### ADR 0006 — Ciclo de vida del pedido: kiosk, dashboard y cocina

- **Contexto:** los pedidos entran por dos canales (kiosk público y dashboard autenticado),
  se preparan en cocina y se cobran/cierran en caja, con concurrencia entre pantallas.
- **Decisión:** máquina de estados única (`order-state-machine.ts`):
  - Secuencia canónica `CREATED → CONFIRMED → PROCESSING → SERVED → COMPLETED`; `CANCELLED`
    es salida lateral terminal.
  - **Entrada:** kiosk (`POST /v1/kiosk/:slug/orders`, público, inicia `CREATED`) y dashboard
    (`POST /v1/orders`, ADMIN/MANAGER, `orderSource: STAFF`, inicia `CONFIRMED`). Ambos
    requieren caja abierta (`409 NO_OPEN_CASH_REGISTER`), validan/decrementan stock y asignan
    `orderNumber` secuencial dentro de la `$transaction` con lock de `CashShift`.
  - **Cocina (KDS):** autenticada por token de dispositivo per-restaurante (`X-Kitchen-Token`,
    ver ADR 0001), no por JWT. Ve solo `CONFIRMED` + `PROCESSING`, sin datos comerciales
    (`totalAmount`/cliente ocultos en el payload). Transiciones permitidas:
    `CONFIRMED → PROCESSING → SERVED`. **Nunca** confirma, completa ni cancela.
  - **Dashboard/caja:** confirma (`CREATED → CONFIRMED`), cobra (`PATCH /:id/pay`, no cambia
    status), completa (`SERVED → COMPLETED` exige `isPaid=true`, si no `ORDER_NOT_PAID`) y
    cancela.
  - **Cancelación:** desde `CREATED/CONFIRMED/PROCESSING/SERVED` y solo si `!isPaid`
    (`COMPLETED` y pagadas no se cancelan). Si la orden no había entrado a cocina
    (`CREATED/CONFIRMED`) el stock se **restaura**; si estaba en `PROCESSING/SERVED` no.
  - **Concurrencia:** transiciones de status con concurrencia optimista
    (`UPDATE ... WHERE id=? AND status=?`); el perdedor obtiene `count=0` y falla con error
    de dominio. Invariante: nunca `CANCELLED && isPaid=true`.
- **Consecuencias:** la cocina no puede cobrar ni cerrar; el dinero cobrado nunca se pierde
  en el cierre de caja; el aislamiento por restaurante aplica en todos los canales.
- **Referencias (guía de implementación detallada):** `src/orders/orders.module.info.md`,
  `src/kitchen/kitchen.module.info.md`, `src/kiosk/kiosk.module.info.md`,
  `src/orders/order-state-machine.ts`. Consolida los ADRs históricos
  `2026-03-09-auto-print-on-order.md` y `2026-03-09-kitchen-display.md`.

### Actualización del índice

`apps/api-core/docs/adr/README.md`: documentar las convenciones MADR, listar 0001–0006 en
la tabla, y añadir una sección **"Históricos (pre-numeración MADR)"** con los 3 docs movidos
desde el root.

---

## 3. Reorganización de docs (mover legacy del root)

### Mover a `apps/api-core/docs/`

| Origen | Destino | Nota |
|---|---|---|
| `docs/adr/2026-03-08-refactor-modules-design.md` | `apps/api-core/docs/adr/` | histórico pre-MADR |
| `docs/adr/2026-03-09-auto-print-on-order.md` | `apps/api-core/docs/adr/` | histórico; consolidado por ADR 0006 |
| `docs/adr/2026-03-09-kitchen-display.md` | `apps/api-core/docs/adr/` | histórico; consolidado por ADR 0006 |
| `docs/adr/new-requirements.md` | `apps/api-core/docs/module-doc-requirements.md` | es un checklist de requisitos, no un ADR |
| `docs/plans/2026-03-08-refactor-modules-design.md` | `apps/api-core/docs/plans/` | |
| `docs/plans/2026-03-08-refactor-modules-implementation.md` | `apps/api-core/docs/plans/` | |
| `docs/pending-kitchen-payment-gate.md` | `apps/api-core/docs/pending/` | pendiente del API |
| `docs/pending-reservations-module.md` | `apps/api-core/docs/pending/` | pendiente del API |

### Mover a `apps/ui/docs/`

| Origen | Destino |
|---|---|
| `docs/ui/dynamic-url-injection.md` | `apps/ui/docs/dynamic-url-injection.md` |

### Eliminar

| Archivo | Razón |
|---|---|
| `docs/different-db-in-local-vs-cloud.md` | modelo híbrido SQLite, superseded por ADR 0002 |
| `apps/api-core/docs/pending/dynamic-database-provider.md` | provider dinámico SQLite, superseded por ADR 0002 |
| `docs/mis-revisiones.md` | vacío (0 líneas) |
| `docs/pending-update-model-products.md` | precursor de `money-conversion.md`; describe SQLite híbrido, superseded por ADR 0003 |

### Mantener en el root (sin tocar)

- `docs/architecture-ui-backend.md` — arquitectura cross-app (doc global legítimo).
- `docs/build-and-test-guide.md` — build/ofuscación/Electron (producto desktop futuro).
- `docs/pending-electron-binary-setup.md`, `docs/pending-session-context-packaging.md`,
  `docs/pending-to-deploy-the-stack.md` — desktop/licencias futuro.
- `docs/pending-whatsapp-chatbot-integration.md` — producto futuro.
- `docs/superpowers/` — rastro de planes/specs (gestionado por las skills; no mover).

### Limpieza puntual

- `apps/api-core/docs/money-conversion.md` (líneas ~60-68): quitar la nota de compat del
  driver SQLite en `fromCents` (ya solo hay BigInt de PostgreSQL). Coherente con ADR 0002.

### Índices a actualizar

- `apps/api-core/docs/adr/README.md` (convenciones + tabla 0001–0006 + históricos).
- `apps/api-core/docs/README.md`: **no existe** — se crea como índice del folder (lo exige
  la convención de documentación del repo).
- `apps/ui/docs/README.md`: añadir entrada para `dynamic-url-injection.md`.

---

## Orden de ejecución sugerido

1. Crear ADRs 0002–0006 y actualizar `adr/README.md`.
2. Mover archivos legacy del root (git mv) a los destinos de las tablas.
3. Eliminar los 4 archivos obsoletos.
4. Limpieza puntual de `money-conversion.md`.
5. Crear/actualizar los índices `README.md` de cada `docs/`.
6. Verificar que no queden enlaces rotos a los archivos movidos/eliminados (grep de rutas).

## Verificación

- `grep -rn` de las rutas movidas/eliminadas en `docs/`, `apps/*/docs/` y `*.md` del root
  para detectar enlaces rotos.
- Revisar que cada `docs/` tenga su `README.md` actualizado (convención del repo).
- No se toca código ni tests; no se requiere correr la suite.
