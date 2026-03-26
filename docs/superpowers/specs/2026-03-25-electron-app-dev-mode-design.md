# Electron App — Dev Mode Implementation Design

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Implement `apps/desktop/` to run locally with `electron .` (no installer, no code signing)

---

## Overview

Implement the Electron shell (`apps/desktop/`) based on the existing architecture in
`docs/superpowers/specs/2026-03-18-desktop-packaging-design.md`, scoped for local
development. The result must be runnable with `electron .` and fully testable on macOS
without generating an installer or signing anything.

---

## Goals

- Run `electron .` from `apps/desktop/` and have the full app work
- Full trial system (15 days, macOS Keychain backup) as per the original spec
- Dev backend toggle: `ELECTRON_DEV_BACKEND` to connect to a running NestJS instead of
  spawning the binary
- License skip bypass: `ELECTRON_SKIP_LICENSE=true` to skip all trial/license checks in dev
- Documentation file with clear setup and run instructions

---

## File Map

```
apps/desktop/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── .env.example
├── docs/
│   └── running-locally.md          ← setup + run instructions
├── src/
│   ├── main.ts                     ← Electron main process entry
│   ├── preload.ts                  ← contextBridge (minimal)
│   ├── license/
│   │   ├── crypto.ts               ← AES-256 encrypt/decrypt helpers
│   │   ├── machine-id.ts           ← stable machine fingerprint
│   │   ├── trial.ts                ← firstLaunchAt storage + Keychain backup
│   │   ├── activation.ts           ← read + RSA-verify license.enc
│   │   └── license-guard.ts        ← orchestrates trial + activation check
│   ├── server/
│   │   └── spawn.ts                ← spawn binary or connect to dev server
│   └── tray/
│       └── tray.ts                 ← system tray menu
└── resources/
    ├── public.pem                  ← RSA public key (already exists)
    └── activate.html               ← activation / trial-expired page
```

---

## Startup Flow

```
Electron starts
  │
  ├─ ELECTRON_SKIP_LICENSE=true?
  │    └─ yes → skip guard entirely, proceed to server
  │
  ├─ LicenseGuard.check() → one of:
  │    ├─ LICENSED  — valid RSA JWT in license.enc, machineId matches
  │    ├─ TRIAL     — no license, firstLaunchAt ≤ 15 days ago
  │    └─ EXPIRED   — no license, firstLaunchAt > 15 days ago
  │
  ├─ EXPIRED → open activate.html in BrowserWindow; NestJS never starts
  │
  ├─ TRIAL/LICENSED → proceed
  │
  ├─ ServerManager.start()
  │    ├─ ELECTRON_DEV_BACKEND set → use that URL, no spawn
  │    └─ not set → detect platform, spawn binary from resources/bin/,
  │                  pass env vars, poll GET /health every 500 ms
  │
  └─ BrowserWindow opens → http://localhost:{PORT}
       └─ Tray icon always visible
```

---

## License Guard

### Trial storage

- `firstLaunchAt` written to two stores on first launch:
  1. `userData/trial.enc` — AES-256 encrypted JSON
  2. macOS Keychain — service `com.restaurants.trial`, account `firstLaunchAt`
- Every subsequent launch reads **both** and uses the **earliest** date
- Deleting `trial.enc` alone does not reset the trial

### Activation storage

- RSA JWT token stored in `userData/license.enc` — AES-256 encrypted
- On load: decrypt → `jwt.verify(token, RSA_PUBLIC_KEY)` using `jsonwebtoken`
- Payload must contain `machineId` matching the current machine; mismatch → treat as invalid

### Guard result shape

```typescript
type GuardResult =
  | { status: 'licensed' }
  | { status: 'trial'; daysRemaining: number }
  | { status: 'expired' }
```

---

## Dev Backend Toggle (`spawn.ts`)

Two modes selected by environment variable:

### Mode 1 — `ELECTRON_DEV_BACKEND=http://localhost:3000` (dev server)

- Electron does not spawn any process
- Uses the provided URL directly as the backend origin
- Useful when `pnpm dev` is already running in `apps/api-core`

### Mode 2 — no `ELECTRON_DEV_BACKEND` (spawn binary)

- Detects platform: `darwin/arm64` → `api-core-node22-macos-arm64`,
  `darwin/x64` → `api-core-node22-macos-x64`, `win32/x64` → `api-core-node22-win-x64.exe`
- Binary looked up at `resources/bin/{name}` relative to the Electron app resources
- Selects a random available TCP port
- Spawns binary with env vars:
  ```
  DATABASE_URL=file://{userData}/database.sqlite
  UPLOADS_PATH={userData}/uploads
  BETTER_SQLITE3_BINDING={resourcesPath}/better-sqlite3.node
  PRISMA_QUERY_ENGINE_LIBRARY={resourcesPath}/prisma-engine
  PORT={port}
  JWT_SECRET={from .env}
  TZ={from .env}
  NODE_ENV=production
  FRONTEND_URL=http://localhost:{port}
  ```
- Polls `GET http://localhost:{port}/health` every 500 ms, timeout 30 s
- On spawn exit: logs error, shows dialog, quits Electron

---

## System Tray

Always visible while app is running:

| Menu item | Action |
|-----------|--------|
| Open dashboard | Show/focus BrowserWindow |
| Server: running ✓ / starting… | Informational only |
| ─── | Separator |
| Quit | Kill NestJS process (if spawned), destroy tray, quit app |

Closing the BrowserWindow (X button) hides the window but keeps NestJS running.
Only tray "Quit" fully terminates everything.

---

## activate.html

Standalone HTML file (no external dependencies) loaded via `loadFile`.
Two states driven by URL query param `?state=trial&days=N` or `?state=expired`:

- **Trial active:** banner "N días restantes en período de prueba", app runs normally behind
- **Expired:** form to enter license key → calls license server → on success saves token,
  relaunches Electron

For the activation call, the HTML page uses `window.electronAPI.activate(key)` exposed via
preload's `contextBridge`.

---

## Crypto helpers (`crypto.ts`)

AES-256-GCM using Node.js built-in `crypto`:

```
encrypt(plaintext, key) → { iv, authTag, ciphertext } as base64 string
decrypt(base64string, key) → plaintext string
```

Encryption key derived from `machineId + app version` via `crypto.scryptSync` so the
encrypted files are tied to the machine.

---

## Dev Environment Variables

File `apps/desktop/.env.example` (copy to `.env` for local use):

```bash
# Required when spawning the binary
JWT_SECRET=dev-secret-change-me
TZ=America/Buenos_Aires

# Dev shortcuts
ELECTRON_DEV_BACKEND=http://localhost:3000   # connect to running NestJS instead of spawning binary
ELECTRON_SKIP_LICENSE=true                   # skip trial/license check entirely
```

---

## `electron-builder.yml` (configured but not used in dev)

Defined with correct macOS/Windows targets, `extraResources` pointing to the binary and
native addons. Not invoked during `electron .` but ready for when packaging is needed.

---

## Out of Scope for This Implementation

- Code signing / notarization
- Generating `.dmg` or `.exe` installer
- Electron Fuses (production hardening)
- Windows Registry trial backup (only macOS Keychain implemented now)
- Auto-update

---

## Verification (dev mode)

1. `ELECTRON_SKIP_LICENSE=true` + `ELECTRON_DEV_BACKEND=http://localhost:3000` → window opens, no license check, connects to running NestJS
2. `ELECTRON_SKIP_LICENSE=true` (no dev backend) → window opens, spawns binary, /health polling works
3. No env vars, first launch → trial starts, days-remaining banner visible
4. Manually set `firstLaunchAt` to 16 days ago in `trial.enc` → activation screen appears, NestJS not started
5. Tray: close window → window hides, NestJS still accessible via LAN; tray Quit → everything stops
