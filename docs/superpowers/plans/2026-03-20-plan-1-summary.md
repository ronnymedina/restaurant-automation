# Plan 1 — Prerequisites & Build Tools: Implementation Summary

**Date:** 2026-03-20
**Branch:** `develop`
**Status:** Complete

---

## Objetivo

Convertir las apps Astro a output estático, agregar los cambios requeridos en `api-core`, y crear el paquete compartido `packages/build-tools` que produce artefactos protegidos para distribución desktop y cloud.

---

## Cambios por tarea

### Task 1 & 2: Astro → Static Output

Ambas apps (`ui-dashboard` y `ui-storefront`) convertidas de SSR a modo estático:

- Removido `@astrojs/node` adapter, cambiado a `output: 'static'`
- Las 3 páginas con rutas dinámicas adaptadas para static build:
  - `dash/menus/[id].astro` → renombrado a `detail.astro`; el ID se lee de `window.location.pathname`
  - `kitchen/[slug].astro` → `getStaticPaths` con placeholder `_`; slug leído del cliente
  - `kiosk/[slug].astro` → mismo patrón que kitchen

### Task 3: Endpoint `/health` y rutas SPA

- `GET /health` agregado a `AppController` sin guard, retorna `{ status: 'ok' }`
- Electron lo usa para saber cuándo NestJS está listo antes de abrir la ventana
- Rutas SPA fallback agregadas para URLs con parámetros dinámicos:
  - `/dash/menus/:id` → sirve `public/dash/menus/detail/index.html`
  - `/kitchen/:slug` → sirve `public/kitchen/_/index.html`
  - `/storefront/kiosk/:slug` → sirve `public/storefront/kiosk/_/index.html`

### Task 4: Paths configurables por entorno

- `UPLOADS_PATH` y `API_PUBLIC_PATH` exportados desde `apps/api-core/src/config.ts`
- Fallback a `process.cwd()/uploads` y `process.cwd()/public` si no se definen
- En modo desktop, Electron inyecta estas variables apuntando a `userData/`
- `ServeStaticModule` en `app.module.ts` usa ambas rutas

### Task 5: Prisma Migrations

- Migración inicial generada: `prisma/migrations/20260319231140_init/migration.sql` (13 tablas)
- Reemplaza el flujo de `db push` para que `prisma migrate deploy` funcione en el startup del desktop sin perder datos entre actualizaciones

### Task 6: `packages/build-tools`

Nuevo paquete compartido con 4 scripts:

| Script | Función |
|--------|---------|
| `copy-static.mjs` | Copia `ui-dashboard/dist` y `ui-storefront/dist` → `api-core/public/` |
| `obfuscate.mjs` | Ofusca `api-core/dist/` in-place con settings conservadores (seguros para NestJS decorators) |
| `compile-bytecode.mjs` | Compila `.js` → `.jsc` con bytenode → `dist-bytecode/` (para cloud) |
| `compile-binary.mjs` | Genera binarios standalone con `@yao-pkg/pkg` para `win-x64`, `macos-x64`, `macos-arm64` (para desktop) |

Settings de ofuscación: `renameGlobals: false`, `deadCodeInjection: false`, `controlFlowFlattening: false` — conservadores para preservar decorator metadata de NestJS.

### Task 7: Turborepo Pipeline

`turbo.json` extendido con tres nuevas tareas:

```
copy-static     dependsOn: [@restaurants/ui-dashboard#build, @restaurants/ui-storefront#build]
build:cloud     dependsOn: [api-core#build, @restaurants/build-tools#copy-static]
build:desktop   dependsOn: [api-core#build, @restaurants/build-tools#copy-static]
```

Todas marcadas `"cache": false` — producen artefactos fuera del paquete ejecutor, Turbo no puede cachearlos.

---

## Commits

| Hash | Descripción |
|------|-------------|
| `f043814` | feat(ui-dashboard): switch to static output for desktop distribution |
| `0d538fb` | fix(ui-dashboard): restore kitchen/[slug].astro with getStaticPaths placeholder |
| `e8e5524` | feat(ui-storefront): switch to static output for desktop distribution |
| `5afe024` | feat(api-core): add GET /health endpoint for Electron startup health check |
| `1b7fa25` | feat(api-core): add UPLOADS_PATH and API_PUBLIC_PATH env vars for desktop mode |
| `e725b9c` | feat(api-core): initialize Prisma migration baseline for desktop distribution |
| `a4a88f1` | feat(build-tools): add shared obfuscation, bytecode, and binary compilation scripts |
| `06c7106` | fix(build-tools): use local bytenode binary and inherit stdio in compile-bytecode |
| `f7d0b95` | feat: wire Astro static copy and protected build tasks into Turborepo pipeline |
| `c4e2e00` | fix(turbo): mark build pipeline tasks as non-cacheable (outputs cross package boundary) |
| `6a422df` | fix(build-tools): use local pkg binary instead of npx in compile-binary |
| `94046e6` | chore: fix gitignore and update lockfile for build-tools dependencies |

---

## Pendiente

- **Plan 2:** `apps/license-server` — NestJS API de licencias con activación RSA JWT
- **Plan 3:** `apps/desktop` — Electron app con trial, verificación offline, system tray
