# ADRs (MADR) + Reorganización de Documentación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adoptar MADR como estándar ADR, crear los ADRs 0002–0006 en `apps/api-core/docs/adr/`, reorganizar la documentación legacy del root bajo cada app, y eliminar la documentación obsoleta del modelo híbrido SQLite.

**Architecture:** Documentación-only. Cada ADR registra una decisión (formato MADR en español) y referencia la guía de implementación existente sin duplicarla. La reorg usa `git mv` para preservar historia. No se toca código ni tests.

**Tech Stack:** Markdown, git. Sin runtime.

**Fuente de contenido:** el spec `apps/api-core/docs/superpowers/specs/2026-06-13-adr-and-docs-reorg-design.md` contiene la decisión completa de cada ADR (secciones "ADR 0002"…"ADR 0006") y las tablas de reorg. Cada tarea de creación de ADR transcribe la decisión de su sección del spec a la plantilla MADR.

**Plantilla MADR (todas las ADRs nuevas siguen estas secciones, en español):**

```markdown
# ADR NNNN — <título>

**Estado:** Aceptado
**Fecha:** 2026-06-13

## Contexto
## Decisión
## Consecuencias positivas
## Consecuencias negativas
## Alternativas consideradas
## Referencias
```

---

## File Structure

- `apps/api-core/docs/adr/0002-postgresql-unica-base-de-datos.md` — Create
- `apps/api-core/docs/adr/0003-modelo-monetario-centavos-bigint.md` — Create
- `apps/api-core/docs/adr/0004-presentacion-localizada-por-restaurante.md` — Create
- `apps/api-core/docs/adr/0005-roles-y-autorizacion.md` — Create
- `apps/api-core/docs/adr/0006-ciclo-de-vida-del-pedido.md` — Create
- `apps/api-core/docs/adr/README.md` — Modify (convenciones MADR + tabla 0001–0006 + históricos)
- `apps/api-core/docs/README.md` — Create (índice del folder; no existe)
- `apps/ui/docs/README.md` — Modify (añadir entrada dynamic-url-injection)
- `apps/api-core/docs/money-conversion.md` — Modify (quitar nota compat SQLite)
- Movimientos `git mv` (root → apps) y eliminaciones (ver Tasks 8–10)

---

### Task 1: ADR 0002 — PostgreSQL como única base de datos

**Files:**
- Create: `apps/api-core/docs/adr/0002-postgresql-unica-base-de-datos.md`

- [ ] **Step 1: Crear el ADR**

Usar la plantilla MADR. Transcribir la decisión de la sección "ADR 0002" del spec:
- **Contexto:** se barajó modelo híbrido SQLite local + Postgres cloud vía provider dinámico de Prisma; dos motores = doble mantenimiento.
- **Decisión:** cloud-only SaaS sobre PostgreSQL único; schema canónico `prisma/schema.postgresql.prisma`; híbrido descartado.
- **Consecuencias positivas:** una sola cadena de migraciones; `BigInt` nativo sin compat de driver SQLite; se elimina script selector de schema y `DATABASE_PROVIDER`.
- **Consecuencias negativas:** un eventual self-hosted con SQLite requeriría un nuevo ADR; dependencia de un Postgres gestionado.
- **Alternativas consideradas:** provider dinámico SQLite/Postgres (rechazado); LibSQL/Turso vía driverAdapters (innecesario hoy).
- **Referencias:** supersede `docs/different-db-in-local-vs-cloud.md` y `apps/api-core/docs/pending/dynamic-database-provider.md` (eliminados en Task 10); `prisma/schema.postgresql.prisma`.

- [ ] **Step 2: Verificar formato**

Run: `head -5 apps/api-core/docs/adr/0002-postgresql-unica-base-de-datos.md`
Expected: título `# ADR 0002 — …`, líneas `**Estado:**` y `**Fecha:**`.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/adr/0002-postgresql-unica-base-de-datos.md
git commit -m "docs(adr): 0002 PostgreSQL como única base de datos"
```

---

### Task 2: ADR 0003 — Modelo monetario: centavos (BigInt)

**Files:**
- Create: `apps/api-core/docs/adr/0003-modelo-monetario-centavos-bigint.md`

- [ ] **Step 1: Crear el ADR**

Transcribir la sección "ADR 0003" del spec:
- **Contexto:** floats pierden precisión; se necesita aritmética exacta y modelo multi-moneda simple.
- **Decisión:** montos como `BigInt` en centavos (×100 fijo); conversión solo en bordes (`toCents` en DTO `@Transform`, `fromCents` en serializer `@Transform`); dominio nunca en decimal; currency-agnostic (siempre 2 decimales, sin minor units ISO 4217; `currency` solo etiqueta).
- **Consecuencias positivas:** sin errores de coma flotante; frontend siempre en pesos; JSON expone números.
- **Consecuencias negativas:** CLP/JPY igual se almacenan con 2 decimales; ocultar decimales sería cambio futuro de capa display.
- **Alternativas consideradas:** `Decimal` de Prisma (fricción en JS/TS, pérdida de precisión); floats (descartado).
- **Referencias:** `apps/api-core/docs/money-conversion.md`; `apps/ui/docs/money-formatting.md`; `src/common/helpers/money.ts`. Audits R2-10, R2-06, H-01.

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/docs/adr/0003-modelo-monetario-centavos-bigint.md
git commit -m "docs(adr): 0003 modelo monetario en centavos BigInt"
```

---

### Task 3: ADR 0004 — Presentación localizada por restaurante

**Files:**
- Create: `apps/api-core/docs/adr/0004-presentacion-localizada-por-restaurante.md`

- [ ] **Step 1: Crear el ADR**

Transcribir la sección "ADR 0004" del spec:
- **Contexto:** distintos restaurantes muestran fecha/dinero con convenciones distintas (punto vs coma, zona horaria).
- **Decisión:** presentación es config por restaurante en `RestaurantSettings` (`timezone` def `UTC`, `decimalSeparator` def `,`, `thousandsSeparator` def `.`, `currency` etiqueta); fechas en UTC ISO8601, formateadas al timezone server-side (`displayTime` vía `TimezoneService`); dinero cruza en pesos, formato (`$1.234,50`) es display cliente vía `formatMoney(amount, settings)`; editable en `/dash/settings`, endpoint `GET/PATCH /v1/restaurants/settings` (PATCH ADMIN-only).
- **Consecuencias positivas:** ninguna vista formatea a mano; separadores por superficie (hook React, `localStorage` Astro, store kiosk).
- **Consecuencias negativas:** la UI obtiene separadores de 3 fuentes distintas según superficie (complejidad de sincronización).
- **Alternativas consideradas:** locale fijo global (rechazado: multi-tenant); formateo en backend (rechazado: el backend expone números crudos en pesos).
- **Referencias:** `apps/ui/docs/money-formatting.md`; `apps/ui/src/pages/dash/settings.astro` + `components/dash/RestaurantSettingsForm`; modelo `RestaurantSettings`; ADR 0003.

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/docs/adr/0004-presentacion-localizada-por-restaurante.md
git commit -m "docs(adr): 0004 presentación localizada por restaurante"
```

---

### Task 4: ADR 0005 — Roles y autorización

**Files:**
- Create: `apps/api-core/docs/adr/0005-roles-y-autorizacion.md`

- [ ] **Step 1: Verificar la matriz de permisos contra el código**

Run: `grep -rn "@Roles(" apps/api-core/src --include="*controller*.ts"`
Expected: lista de endpoints con sus roles. Usar esta salida como fuente de verdad para la tabla del ADR (no inventar).

- [ ] **Step 2: Crear el ADR**

Transcribir la sección "ADR 0005" del spec + incluir la **tabla de matriz de permisos** derivada del Step 1. Estructura de la tabla: columnas `Recurso | Lectura | Escritura/acciones`. Resumen verificado:
- Lectura catálogo/órdenes/menús: `ADMIN, MANAGER, BASIC`.
- Escritura productos/categorías/menús, órdenes (crear/avanzar/pagar/cancelar): `ADMIN, MANAGER`.
- Gestión de usuarios, settings del restaurante, token de cocina: `ADMIN`.
- Kiosk: `@Public()` (sin auth).
- Secciones MADR: Contexto (staff con niveles; multi-tenant); Decisión (`ADMIN > MANAGER > BASIC`; `JwtAuthGuard` global; `RolesGuard` + `@Roles`; ADMIN bypassa; `@Public()`; `restaurantId` siempre del JWT; config ADMIN-only); Consecuencias; Alternativas (permisos granulares por endpoint — rechazado por complejidad); Referencias (`src/common` guards/decorators, `src/users`, ADR 0001).

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/adr/0005-roles-y-autorizacion.md
git commit -m "docs(adr): 0005 roles y autorización"
```

---

### Task 5: ADR 0006 — Ciclo de vida del pedido

**Files:**
- Create: `apps/api-core/docs/adr/0006-ciclo-de-vida-del-pedido.md`

- [ ] **Step 1: Crear el ADR**

Transcribir la sección "ADR 0006" del spec. Incluir un diagrama mermaid `stateDiagram-v2` de la secuencia `CREATED → CONFIRMED → PROCESSING → SERVED → COMPLETED` con la salida lateral `CANCELLED`, anotando qué actor (cajero/cocina) hace cada transición. Cubrir:
- Entrada: kiosk (`POST /v1/kiosk/:slug/orders`, público, inicia `CREATED`) y dashboard (`POST /v1/orders`, ADMIN/MANAGER, `orderSource: STAFF`, inicia `CONFIRMED`); ambos exigen caja abierta (`409 NO_OPEN_CASH_REGISTER`), validan/decrementan stock, asignan `orderNumber` en `$transaction` con lock de `CashShift`.
- Cocina (KDS): token de dispositivo per-restaurante (`X-Kitchen-Token`), no JWT; ve solo `CONFIRMED`+`PROCESSING` sin datos comerciales; transiciones `CONFIRMED → PROCESSING → SERVED`; nunca confirma/completa/cancela.
- Dashboard/caja: confirma, cobra (`PATCH /:id/pay`, no cambia status), completa (`SERVED → COMPLETED` exige `isPaid=true`, si no `ORDER_NOT_PAID`), cancela.
- Cancelación: desde `CREATED/CONFIRMED/PROCESSING/SERVED` y solo si `!isPaid`; restaura stock si no había entrado a cocina (`CREATED/CONFIRMED`), no lo restaura en `PROCESSING/SERVED`.
- Concurrencia optimista (`UPDATE ... WHERE id=? AND status=?`); invariante `nunca CANCELLED && isPaid=true`.
- **Referencias:** `src/orders/orders.module.info.md`, `src/kitchen/kitchen.module.info.md`, `src/kiosk/kiosk.module.info.md`, `src/orders/order-state-machine.ts`. Consolida los históricos `2026-03-09-auto-print-on-order.md` y `2026-03-09-kitchen-display.md`.

- [ ] **Step 2: Verificar el mermaid**

Run: `grep -c "stateDiagram" apps/api-core/docs/adr/0006-ciclo-de-vida-del-pedido.md`
Expected: `1`.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/adr/0006-ciclo-de-vida-del-pedido.md
git commit -m "docs(adr): 0006 ciclo de vida del pedido (kiosk/dashboard/cocina)"
```

---

### Task 6: Mover ADRs/plans/pending legacy del root al API

**Files:**
- `git mv` de 6 archivos del root a `apps/api-core/docs/`.

- [ ] **Step 1: Mover los archivos**

```bash
cd /Users/ronny/projects/restaurants
git mv docs/adr/2026-03-08-refactor-modules-design.md apps/api-core/docs/adr/2026-03-08-refactor-modules-design.md
git mv docs/adr/2026-03-09-auto-print-on-order.md apps/api-core/docs/adr/2026-03-09-auto-print-on-order.md
git mv docs/adr/2026-03-09-kitchen-display.md apps/api-core/docs/adr/2026-03-09-kitchen-display.md
git mv docs/adr/new-requirements.md apps/api-core/docs/module-doc-requirements.md
git mv docs/plans/2026-03-08-refactor-modules-implementation.md apps/api-core/docs/plans/2026-03-08-refactor-modules-implementation.md
git mv docs/pending-kitchen-payment-gate.md apps/api-core/docs/pending/kitchen-payment-gate.md
git mv docs/pending-reservations-module.md apps/api-core/docs/pending/reservations-module.md
```

Nota: `docs/plans/2026-03-08-refactor-modules-design.md` (homónimo del ADR) NO se mueve por colisión potencial de nombre; el contenido de diseño queda cubierto por el ADR movido. Si existe y aporta, moverlo como `apps/api-core/docs/plans/2026-03-08-refactor-modules-design-plan.md`.

- [ ] **Step 2: Verificar que el root quedó limpio de esos archivos**

Run: `ls docs/adr/ docs/pending-*.md 2>/dev/null`
Expected: `docs/adr/` ya no contiene los 3 ADR movidos ni `new-requirements.md`; ya no hay `pending-kitchen-payment-gate.md` ni `pending-reservations-module.md`.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: mover ADRs/plans/pending del API desde root a apps/api-core/docs"
```

---

### Task 7: Mover doc de UI del root a apps/ui/docs

**Files:**
- `git mv docs/ui/dynamic-url-injection.md` → `apps/ui/docs/dynamic-url-injection.md`

- [ ] **Step 1: Mover**

```bash
cd /Users/ronny/projects/restaurants
git mv docs/ui/dynamic-url-injection.md apps/ui/docs/dynamic-url-injection.md
rmdir docs/ui 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs(ui): mover dynamic-url-injection a apps/ui/docs"
```

---

### Task 8: Limpieza puntual de money-conversion.md

**Files:**
- Modify: `apps/api-core/docs/money-conversion.md` (líneas ~60-68)

- [ ] **Step 1: Editar la sección `fromCents`**

Quitar la mención a compatibilidad con el driver SQLite (better-sqlite3). `fromCents` ahora solo recibe `bigint` de PostgreSQL. Reescribir el ejemplo eliminando `fromCents(1250) // compat SQLite driver` y la frase "Acepta `number` además de `bigint` por compatibilidad con el driver SQLite". Si la firma de la función mantiene `bigint | number` en el código, dejar una nota neutra ("acepta `number` por robustez") sin mencionar SQLite. Verificar la firma real antes de editar:

Run: `grep -n "fromCents" apps/api-core/src/common/helpers/money.ts`

- [ ] **Step 2: Verificar que no quedan menciones SQLite**

Run: `grep -in "sqlite" apps/api-core/docs/money-conversion.md`
Expected: sin resultados.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/money-conversion.md
git commit -m "docs: quitar nota de compat SQLite en money-conversion (ADR 0002)"
```

---

### Task 9: Eliminar documentación obsoleta del modelo híbrido

**Files:**
- Delete: 4 archivos.

- [ ] **Step 1: Eliminar**

```bash
cd /Users/ronny/projects/restaurants
git rm docs/different-db-in-local-vs-cloud.md
git rm apps/api-core/docs/pending/dynamic-database-provider.md
git rm docs/mis-revisiones.md
git rm docs/pending-update-model-products.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: eliminar docs obsoletos del modelo híbrido SQLite (ADR 0002/0003)"
```

---

### Task 10: Actualizar índices README

**Files:**
- Modify: `apps/api-core/docs/adr/README.md`
- Create: `apps/api-core/docs/README.md`
- Modify: `apps/ui/docs/README.md`

- [ ] **Step 1: Actualizar `adr/README.md`**

Documentar convenciones MADR (secciones, estados `Propuesto/Aceptado/Superseded/Deprecado`, inmutabilidad, un folder por proyecto). Tabla con 0001–0006. Añadir sección "## Históricos (pre-numeración MADR)" listando `2026-03-08-refactor-modules-design.md`, `2026-03-09-auto-print-on-order.md`, `2026-03-09-kitchen-display.md` con nota de que 0006 consolida los dos últimos.

- [ ] **Step 2: Crear `apps/api-core/docs/README.md`**

Índice del folder listando cada archivo `.md` y subcarpeta (`adr/`, `plans/`, `pending/`, `commands.md`, `database_schema.md`, `environments.md`, `k6-metrics-guide.md`, `money-conversion.md`, `module-doc-requirements.md`, `opentelemetry.md`, `print-cloud.md`, `testing*.md`) con una línea de descripción cada uno. Verificar el inventario real antes de escribir:

Run: `ls apps/api-core/docs/`

- [ ] **Step 3: Actualizar `apps/ui/docs/README.md`**

Añadir línea: `- [dynamic-url-injection.md](dynamic-url-injection.md) — inyección del PUBLIC_API_URL en el bundle estático.`

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/docs/adr/README.md apps/api-core/docs/README.md apps/ui/docs/README.md
git commit -m "docs: índices README (ADR MADR, api-core, ui)"
```

---

### Task 11: Verificación final de enlaces rotos

- [ ] **Step 1: Buscar referencias a rutas movidas/eliminadas**

```bash
cd /Users/ronny/projects/restaurants
grep -rn "different-db-in-local-vs-cloud\|dynamic-database-provider\|pending-update-model-products\|mis-revisiones\|docs/ui/dynamic-url-injection\|pending-kitchen-payment-gate\|pending-reservations-module\|docs/adr/2026-03-09\|docs/adr/2026-03-08\|docs/adr/new-requirements" \
  --include="*.md" . | grep -v "docs/superpowers/" | grep -v ".claude/worktrees/"
```
Expected: solo coincidencias dentro del spec/plan de esta tarea (que describen los movimientos). Cualquier otra referencia en docs vivos debe corregirse a la nueva ruta.

- [ ] **Step 2: Confirmar que cada docs/ tiene README**

Run: `ls apps/api-core/docs/README.md apps/ui/docs/README.md apps/api-core/docs/adr/README.md`
Expected: los 3 existen.

- [ ] **Step 3: Commit (si hubo correcciones de enlaces)**

```bash
git commit -am "docs: corregir enlaces a archivos reubicados" || echo "sin cambios"
```

---

## Self-Review

- **Spec coverage:** MADR (Task 10 README) ✓; ADRs 0002–0006 (Tasks 1–5) ✓; reorg root→app (Tasks 6–7) ✓; eliminaciones (Task 9) ✓; limpieza money-conversion (Task 8) ✓; índices (Task 10) ✓; verificación enlaces (Task 11) ✓; "mantener en root" = no aparece en ninguna task (correcto, no se tocan).
- **Placeholders:** las tareas de ADR remiten a secciones concretas del spec committeado + plantilla MADR fija; no hay "TBD".
- **Consistencia:** nombres de archivo de ADR consistentes entre File Structure, tasks y Task 11; la matriz de permisos (Task 4) y el flujo (Task 5/Task 6 del orders) se derivan de comandos `grep` reales, no inventados.
