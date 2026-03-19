# Desktop Packaging & License System — Design Spec

**Date:** 2026-03-18
**Status:** Approved

## Overview

Convert the existing NestJS + Astro restaurant management system into a distributable desktop application sold via one-time license purchase. The app runs fully on the local network (LAN), requires no ongoing internet connection after license activation, and is distributed as a native installer for macOS and Windows.

---

## Goals

- Package the software as a native desktop app installable on macOS and Windows
- Sell via one-time license with hardware binding (one license = one machine)
- 15-day free trial without requiring a license key
- Protect source code from reverse engineering via obfuscation + binary compilation
- macOS installer signed and notarized with existing Apple Developer certificate
- Windows installer unsigned for now (SmartScreen warning acceptable at current stage)
- Auto-start on system boot, no manual intervention required
- Simple manual license management (no dashboard, tracked in a spreadsheet)

---

## Monorepo Structure

```
apps/
├── api-core/          # NestJS backend (existing)
├── ui-dashboard/      # Astro dashboard (existing)
├── ui-storefront/     # Astro kiosk (existing)
├── desktop/           # Electron wrapper (new)
└── license-server/    # NestJS license API (new)
```

---

## Architecture

In production (desktop mode), all components run as a single installed application:

```
[Electron main process]
        │
        └── spawn → [NestJS binary (pkg-compiled)]
                         │
                         ├── serves /public → Astro static files (dashboard + storefront)
                         ├── SQLite database (in userData directory)
                         ├── WebSocket (Socket.IO)
                         └── Printer access (local network)

[Electron BrowserWindow] → http://localhost:{PORT}
```

- Electron is the native shell: manages window, tray, auto-launch, and lifecycle
- NestJS binary is the only child process
- Astro frontends compile to static files served directly by NestJS
- In development, all apps continue running separately via Turborepo as today

---

## Build Pipeline

```
PHASE 1 — Build frontends
  astro build (ui-dashboard)   → dist/
  astro build (ui-storefront)  → dist/
  javascript-obfuscator dist/  → dist-obfuscated/
  copy to apps/api-core/public/

PHASE 2 — Compile NestJS to binary
  nest build                              → dist/
  javascript-obfuscator dist/            → dist-obfuscated/
  pkg dist-obfuscated/main.js            → api-core-binary
  (targets: node18-win-x64, node18-macos-x64, node18-macos-arm64)

PHASE 3 — Assemble Electron app
  apps/desktop/resources/
    ├── api-core-binary      (NestJS compiled binary)
    ├── public/              (obfuscated Astro static files)
    └── database.sqlite      (empty initial SQLite)

PHASE 4 — electron-builder packaging
  macOS → .dmg  (signed + notarized via Apple Developer certificate)
  Windows → .exe installer (no signing at this stage)
  All assets packed into encrypted .asar
```

**Three layers of source protection:**
1. `javascript-obfuscator` — renames variables, injects dead code, encrypts strings
2. `pkg` — compiles JS to native binary; no `.js` files are recoverable
3. Encrypted `.asar` — protects frontend assets inside the Electron package

**Turborepo script:** `turbo run build:desktop` triggers all phases in order.

---

## License System (`apps/license-server`)

A minimal NestJS API deployed to Railway. No UI. Owner accesses it manually to generate keys and check status.

### Database (SQLite)

```sql
licenses (
  id           TEXT PRIMARY KEY,
  key          TEXT UNIQUE NOT NULL,
  fingerprint  TEXT,              -- null until activated
  activatedAt  DATETIME,
  platform     TEXT,              -- 'win32' | 'darwin'
  revoked      BOOLEAN DEFAULT 0,
  createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/licenses/generate` | API key (owner only) | Generate a new license key |
| POST | `/licenses/activate` | None | Validate key + bind to hardware |
| GET | `/licenses/:key/status` | API key (owner only) | Check license status |

### Hardware Fingerprint

Computed on the client at activation time:
```
SHA-256(MAC address + CPU model + machine hostname)
```
Stored on the license-server bound to the key. A key already bound to a fingerprint cannot be activated on a different machine.

### Activation Flow

1. Client submits `{ key, fingerprint, platform }` to `/licenses/activate`
2. Server validates: key exists, not revoked, not already bound to a different fingerprint
3. On success: returns a signed JWT `{ activatedAt, hwHash, version: "permanent" }`
4. Client stores JWT encrypted in `userData/activation.enc`
5. Every subsequent launch validates the JWT locally (no network call required)

---

## Trial Period

- On first launch without an activation token, the app records `firstLaunchAt` in `userData/trial.enc` (AES-256 encrypted)
- Every launch checks elapsed time since `firstLaunchAt`
- `< 15 days` → app runs normally, shows banner: "X days remaining in trial"
- `≥ 15 days` → app shows activation screen, all features blocked until a valid license key is entered

---

## Electron App (`apps/desktop`)

### Lifecycle

```
System boot
  └── Electron auto-launches (registered at install time)
        └── Validates license/trial locally
        └── Spawns NestJS binary on a random available port
        └── Polls http://localhost:{PORT}/health every 500ms
        └── Opens BrowserWindow once health check passes
```

### System Tray

Always visible while app is running:
- "Open dashboard"
- "Server status: running ✓"
- "Quit" — closes the window but keeps the NestJS server running

The server continues accepting orders from kiosk devices on the LAN even when the dashboard window is closed.

### User Data Directory

```
userData/  (OS-managed, persists across updates)
  ├── activation.enc   ← encrypted license JWT
  ├── trial.enc        ← encrypted first launch date
  └── database.sqlite  ← restaurant data
```

Data is never deleted during app updates.

### Auto-updates

- `electron-updater` checks for updates from GitHub Releases (or a self-hosted endpoint)
- Update is downloaded in the background
- User sees: "Update available — will install on next restart"
- No forced restarts during service hours

---

## Code Signing

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Signed + notarized | Uses existing Apple Developer certificate via `electron-builder` |
| Windows | Unsigned (for now) | SmartScreen warning shown; user clicks "More info → Run anyway". Acceptable for direct sales. |

---

## Out of Scope

- License management dashboard (manual tracking in spreadsheet)
- Windows code signing certificate (deferred until revenue justifies cost)
- Multi-seat licenses (one license = one machine only)
- Online-only features beyond initial activation
