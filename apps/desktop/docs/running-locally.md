# Electron App — Running Locally

## Prerequisites

- Node.js 22 and pnpm installed
- From repo root: `pnpm install` (installs all workspace dependencies)
- NestJS binaries built: `pnpm --filter @restaurants/api-core build && pnpm build:desktop`
  (only required if using binary spawn mode)

> **Seguridad:** el monorepo bloquea todos los `postinstall` scripts por defecto.
> El binario de Electron **no se descarga automáticamente**. Ver
> `docs/pending-electron-binary-setup.md` para el detalle.

## Setup

```bash
cd apps/desktop
cp .env.example .env
# Edit .env — see Variables section below
pnpm install

# Instalar el binario de Electron (solo necesario la primera vez o tras limpiar node_modules)
pnpm pending
```

## Running

```bash
pnpm dev   # compiles TypeScript + launches electron .
```

The app:
1. Shows a tray icon in the menu bar (macOS) or system tray (Windows)
2. Opens your default browser to the backend URL
3. Registers itself to auto-start on next login (can be disabled in macOS Login Items)

To quit, right-click the tray icon → **Salir**.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes (spawn mode) | Secret passed to NestJS binary |
| `TZ` | Yes (spawn mode) | Timezone, e.g. `America/Buenos_Aires` |
| `ELECTRON_DEV_BACKEND` | No | If set, connects to this URL instead of spawning the binary. Use when `pnpm dev` is already running in `apps/api-core`. |
| `BETTER_SQLITE3_BINDING` | No | Absolute path to `better-sqlite3.node`. Usually auto-resolved in dev. Required in packaged builds. |
| `PRISMA_QUERY_ENGINE_LIBRARY` | No | Absolute path to Prisma query engine binary. Usually auto-resolved in dev. Required in packaged builds. |

## Mode 1 — Connect to running NestJS (fastest for UI development)

```bash
# .env
ELECTRON_DEV_BACKEND=http://localhost:3000
```

Start NestJS separately: `pnpm --filter @restaurants/api-core dev`

Then run: `pnpm dev` in `apps/desktop`

## Mode 2 — Spawn standalone binary

Leave `ELECTRON_DEV_BACKEND` commented out. Requires the binary to exist at
`apps/api-core/dist-binary/api-core-node22-macos-arm64` (or the platform equivalent).

Build it first:
```bash
pnpm --filter @restaurants/api-core build && pnpm build:desktop
```

Then run: `pnpm dev` in `apps/desktop`

## Disabling auto-start

The app registers itself as a login item on first launch.

- **macOS:** System Settings → General → Login Items → remove "Restaurantes"
- **Windows:** Task Manager → Startup apps → disable "Restaurantes"

## Packaging (future)

To produce a `.dmg` (macOS) or `.exe` installer (Windows), see
`docs/pending-to-deploy-the-stack.md`.
