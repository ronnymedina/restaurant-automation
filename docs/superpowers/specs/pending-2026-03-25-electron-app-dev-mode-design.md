# Electron App — Dev Mode Implementation Design

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Implement `apps/desktop/` as a minimal Electron launcher — tray icon + spawn NestJS binary + open system browser. No BrowserWindow, no license system.

---

## Overview

Implement `apps/desktop/` as a minimal Electron process that:
1. Auto-starts on boot (loginItem)
2. Spawns the NestJS standalone binary in background
3. Opens the system browser to `http://localhost:{PORT}` once the backend is ready
4. Shows a system tray icon for control (open, quit)

The client interacts entirely through their system browser, not through an embedded Chromium window. Electron is invisible — it is only a process manager and tray icon.

**License/trial system:** deferred. See `docs/superpowers/specs/pending-2026-03-18-desktop-packaging-design.md` for the full spec. When implemented, the license check will live in **both** the Electron launcher and the NestJS binary (defense in depth — bypassing Electron alone must not be sufficient).

---

## Goals

- Run `electron .` from `apps/desktop/` and have the full app work
- No BrowserWindow — uses `shell.openExternal()` to open the system browser
- Dev backend toggle: `ELECTRON_DEV_BACKEND=http://localhost:3000` connects to an already-running NestJS instead of spawning the binary
- Documentation file with clear setup and run instructions

---

## File Map

```
apps/desktop/
├── package.json
├── tsconfig.json
├── electron-builder.yml          ← configured for future packaging, not used in dev
├── .env.example
├── docs/
│   └── running-locally.md        ← setup + run instructions
└── src/
    ├── main.ts                   ← Electron entry: auto-start + spawn + tray
    ├── server/
    │   └── spawn.ts              ← spawn binary or connect to dev backend
    └── tray/
        └── tray.ts               ← system tray icon + menu
```

No `preload.ts`, no `license/`, no `activate.html` — those belong to the license system
implementation, which is deferred.

---

## Startup Flow

```
Electron starts
  │
  ├─ Register loginItem (auto-start on boot) if not already registered
  │
  ├─ ServerManager.start()
  │    ├─ ELECTRON_DEV_BACKEND set → use that URL directly, no spawn
  │    └─ not set → detect platform, spawn binary,
  │                  poll GET /health every 500 ms (timeout 30 s)
  │
  ├─ shell.openExternal(backendURL) → opens system browser
  │
  └─ Tray icon always visible
```

---

## Dev Backend Toggle (`spawn.ts`)

### Mode 1 — `ELECTRON_DEV_BACKEND=http://localhost:3000`

- Electron does not spawn any process
- Opens the provided URL in the system browser
- Use this when `pnpm dev` is already running in `apps/api-core`

### Mode 2 — no `ELECTRON_DEV_BACKEND` (spawn binary)

- Detects platform: `darwin/arm64` → `api-core-node22-macos-arm64`,
  `darwin/x64` → `api-core-node22-macos-x64`, `win32/x64` → `api-core-node22-win-x64.exe`
- In dev (`app.isPackaged === false`): binary path resolved relative to
  `app.getAppPath()/../api-core/dist-binary/`
- In packaged mode: binary resolved from `process.resourcesPath/bin/`
- Selects a random available TCP port
- Spawns binary with required env vars (see below)
- Polls `GET http://localhost:{port}/health` every 500 ms, timeout 30 s
- On spawn exit unexpectedly: shows native error dialog, quits Electron

### Env vars passed to binary (spawn mode)

```
PORT={port}
NODE_ENV=production
DATABASE_URL=file://{userData}/database.sqlite
UPLOADS_PATH={userData}/uploads
JWT_SECRET={from .env}
TZ={from .env}
FRONTEND_URL=http://localhost:{port}
```

`BETTER_SQLITE3_BINDING` and `PRISMA_QUERY_ENGINE_LIBRARY` are set only if the user
provides them in `.env` (required for packaged mode; in dev mode the binary may find
them automatically if `pnpm install` was run in `api-core`).

---

## System Tray

Always visible while app is running:

| Menu item | Action |
|-----------|--------|
| Abrir dashboard | `shell.openExternal(backendURL)` |
| Servidor: iniciando… / corriendo ✓ | Informational, updates after /health passes |
| ─── | Separator |
| Salir | Kill spawned NestJS process (if any), destroy tray, `app.quit()` |

There is no window to hide/show. "Abrir dashboard" always opens a new browser tab.

---

## Dev Environment Variables

File `apps/desktop/.env.example`:

```bash
# Required when spawning the binary (Mode 2)
JWT_SECRET=dev-secret-change-in-prod
TZ=America/Buenos_Aires

# Optional native addon paths (only needed in packaged mode or if binary can't find them)
# BETTER_SQLITE3_BINDING=/absolute/path/to/better-sqlite3.node
# PRISMA_QUERY_ENGINE_LIBRARY=/absolute/path/to/libquery_engine.dylib.node

# Dev shortcuts
ELECTRON_DEV_BACKEND=http://localhost:3000   # skip binary spawn, connect to running NestJS
```

---

## `electron-builder.yml`

Configured but not invoked during `electron .`. Defines:
- macOS: DMG target, `arm64` + `x64`, icon from `resources/`
- Windows: NSIS installer, `x64`
- `extraResources`: binary + native addons → `resources/bin/`
- `publish: null` (no auto-update yet)

---

## Deferred: License / Trial System

The following is **not implemented** in this version and must be added before distributing
to paying clients:

- Trial period (15 days, AES-encrypted file + macOS Keychain backup)
- License activation (RSA JWT from license server, stored in `userData/license.enc`)
- License check in NestJS binary on startup (defense in depth — bypassing Electron alone
  must not be sufficient to run the app)

Reference: `docs/superpowers/specs/pending-2026-03-18-desktop-packaging-design.md`

---

## Verification (dev mode)

1. `ELECTRON_DEV_BACKEND=http://localhost:3000` with `pnpm dev` running in `api-core` →
   tray appears, system browser opens to localhost:3000
2. No `ELECTRON_DEV_BACKEND` → tray appears with "iniciando…", binary spawns, browser
   opens once `/health` responds
3. Tray "Salir" → binary process killed, tray removed, Electron exits
4. Relaunch → auto-start loginItem is registered (verify in macOS Login Items settings)
