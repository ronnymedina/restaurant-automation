# Desktop Packaging & License System — Design Spec

**Date:** 2026-03-18
**Status:** Draft

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
        └── spawn → [NestJS binary (@yao-pkg/pkg compiled)]
                         │
                         ├── serves /public → Astro static files (dashboard + storefront)
                         ├── SQLite database (in userData directory)
                         ├── WebSocket (Socket.IO)
                         └── Printer access (local network)

[Electron BrowserWindow] → http://localhost:{PORT}
```

- Electron is the native shell: manages window, tray, auto-launch, and lifecycle
- NestJS binary is the only child process
- Astro frontends compile to **static output** (HTML/CSS/JS) served directly by NestJS
- In development, all apps continue running separately via Turborepo as today

### Required: Convert Astro apps to static output

Both `ui-dashboard` and `ui-storefront` currently use `output: 'server'` with the Node adapter. Before the build pipeline can work, both must be changed to `output: 'static'` with the Node adapter removed. This is valid because both UIs are client-side applications with no Astro server-side API routes or middleware dependencies. Any dynamic data fetching uses the NestJS API directly from the browser.

**Three pages currently use `prerender = false` and read `Astro.params` at the server level.** These require a small code change before the static conversion will work — the parameter reading must be moved to a client-side `window.location.pathname` split:

- `apps/ui-dashboard/src/pages/dash/menus/[id].astro` — reads `Astro.params.id` to populate a `data-menu-id` attribute
- `apps/ui-dashboard/src/pages/kitchen/[slug].astro` — dynamic route with `prerender = false`
- `apps/ui-storefront/src/pages/kiosk/[slug].astro` — reads `Astro.params.slug` to populate a `data-slug` attribute

In all three cases the parameter is already consumed by a client-side `<script>` block reading `dataset.*`, so the migration to `window.location.pathname.split('/')` is mechanical and low-risk.

---

## Build Pipeline

```
PHASE 1 — Build frontends (static)
  astro build (ui-dashboard)   → dist/  [static HTML/CSS/JS]
  astro build (ui-storefront)  → dist/  [static HTML/CSS/JS]
  javascript-obfuscator dist/ (conservative settings, see note below)
  copy to apps/api-core/public/

PHASE 2 — Compile NestJS to binary
  nest build                                    → dist/
  javascript-obfuscator dist/ (conservative)   → dist-obfuscated/
  @yao-pkg/pkg dist-obfuscated/main.js         → api-core-binary
  (targets: node22-win-x64, node22-macos-x64, node22-macos-arm64)

  Extract alongside binary (must be in resources/):
    - better-sqlite3.node     (native addon, platform-specific)
    - prisma query engine      (platform-specific binary)
    - uploads/                 (mutable directory, see userData section)

PHASE 3 — Assemble Electron app
  apps/desktop/resources/
    ├── api-core-binary         (NestJS compiled binary)
    ├── better-sqlite3.node     (native addon)
    ├── prisma-query-engine     (Prisma engine binary)
    └── public/                 (obfuscated Astro static files)

  Note: database.sqlite and uploads/ live in userData (not resources/),
  so they persist across app updates.

PHASE 4 — electron-builder packaging
  macOS → .dmg  (signed + notarized via Apple Developer certificate)
  Windows → .exe installer (no signing at this stage)
  All assets packed into encrypted .asar

  ⚠️ Auto-update artifacts (delta zips, new .dmg) must also pass
  Apple notarization — this must be automated in the CI/CD pipeline,
  not only for the initial release.
```

**Three layers of source protection:**
1. `javascript-obfuscator` — renames variables, injects dead code, encrypts strings
2. `@yao-pkg/pkg` — compiles JS to native binary; no `.js` files are recoverable
3. Encrypted `.asar` — protects frontend assets inside the Electron package

**Note on obfuscation settings:** NestJS uses `reflect-metadata` and TypeScript decorators that rely on preserved class/property names. `javascript-obfuscator` must be run with conservative settings (`renameGlobals: false`, `rotateStringArray: true`, `stringArray: true`, `deadCodeInjection: false`) to avoid breaking decorator metadata at runtime. Test the obfuscated build end-to-end before shipping.

**Note on `@yao-pkg/pkg`:** The original `pkg` by Vercel was archived in 2023 and only supports up to Node 18. `@yao-pkg/pkg` is the community-maintained fork with Node 20/22 support and active maintenance.

**Note on native addons:** `better-sqlite3` and the Prisma query engine are native Node addons (`.node` binaries). They cannot be bundled inside the `pkg` virtual filesystem. They must be placed in `resources/` alongside the compiled binary and their paths resolved at runtime via environment variables:
- `BETTER_SQLITE3_BINDING`: path to `better-sqlite3.node`
- `PRISMA_QUERY_ENGINE_LIBRARY`: path to the Prisma engine binary

**Note on Prisma schema migrations:** On app startup, before opening the BrowserWindow, the NestJS binary runs `prisma migrate deploy` against the `userData/database.sqlite`. The Prisma migration engine binary must also be included in `resources/`. This ensures schema upgrades are applied automatically when the user installs a new version, without losing existing data.

**Important pre-requisite:** The project currently uses `db push` for local development and has no `prisma/migrations/` directory. Before the first desktop build, `prisma migrate dev --name init` must be run once to generate the initial migration file. All subsequent schema changes must use `prisma migrate dev` (not `db push`) to keep migrations in sync.

**Turborepo script:** `turbo run build:desktop` triggers all phases in order.

---

## License System (`apps/license-server`)

A minimal NestJS API deployed to Railway. No UI. Owner accesses it manually to generate keys and check status.

### Database

**Production (Railway):** PostgreSQL (Railway-managed). SQLite must not be used on Railway due to ephemeral filesystem.
**Local development:** SQLite (via the existing project pattern).

### Schema

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
| POST | `/licenses/:key/reset-fingerprint` | API key (owner only) | Clear hardware binding for re-activation (customer hardware replacement) |

### Hardware Fingerprint

Computed on the client at activation time using a **2-of-3 tolerance model**:
```
components = [MAC address, CPU model, machine hostname]
fingerprint = SHA-256(sorted(components).join('|'))
```

On validation, at least 2 of the 3 components must match the stored fingerprint. This tolerates NIC replacement, hostname changes, or OS reinstalls without invalidating the license, while still preventing sharing across machines.

If all 3 components change (e.g., complete hardware replacement), the owner uses the `/reset-fingerprint` endpoint to clear the binding, then the customer re-activates on the new machine.

### Activation Flow

1. Client submits `{ key, fingerprint, platform }` to `/licenses/activate`
2. Server validates: key exists, not revoked, fingerprint matches (2-of-3) or is unbound
3. On success: returns a signed JWT `{ activatedAt, hwHash, version: "permanent" }` signed with a symmetric secret embedded in both the license-server and the desktop binary
4. Client stores JWT encrypted in `userData/activation.enc`
5. Every subsequent launch validates the JWT locally (no network call required)

**Security note on the JWT secret:** The symmetric JWT signing secret is embedded in the compiled binary. A determined attacker with sufficient resources could extract it from the binary and forge activation tokens. This is an accepted tradeoff for a B2B restaurant management tool sold directly to non-technical buyers. If this risk becomes unacceptable at scale, migrate to asymmetric signing (private key on server, public key in binary).

---

## Trial Period

- On first launch without an activation token, the app records `firstLaunchAt` in:
  1. `userData/trial.enc` (AES-256 encrypted)
  2. OS-level secondary store: Windows Registry key / macOS `UserDefaults`
- Every launch checks elapsed time from both stores; uses the earliest recorded date
- `< 15 days` → app runs normally, shows banner: "X days remaining in trial"
- `≥ 15 days` → app shows activation screen, all features blocked until a valid license key is entered
- Deleting `trial.enc` alone does not reset the trial if the OS-level record exists

---

## Electron App (`apps/desktop`)

### Required code change in `api-core`

A `/health` endpoint must be added to `api-core` (e.g., `GET /health` returning `{ status: 'ok' }`). Electron polls this endpoint at startup to know when NestJS is ready before opening the BrowserWindow.

### Lifecycle

```
System boot
  └── Electron auto-launches (registered at install time)
        └── Validates license/trial locally
        └── Spawns NestJS binary on a random available port
            with env vars: PRISMA_QUERY_ENGINE_LIBRARY, BETTER_SQLITE3_BINDING,
                           DATABASE_URL=file://userData/database.sqlite,
                           FRONTEND_URL=http://localhost:{PORT},
                           UPLOADS_PATH (userData/uploads/)
        └── Polls http://localhost:{PORT}/health every 500ms
        └── Runs prisma migrate deploy on first launch of new version
        └── Opens BrowserWindow once health check passes
```

### System Tray

Always visible while app is running:
- "Open dashboard"
- "Server status: running ✓"
- "Quit" — terminates the NestJS process and exits Electron completely

Closing the BrowserWindow (X button) hides the window but keeps the NestJS server running. The server continues accepting orders from kiosk devices on the LAN even when no window is visible. Only the tray "Quit" item fully shuts down the service.

### User Data Directory

```
userData/  (OS-managed, persists across updates)
  ├── activation.enc     ← encrypted license JWT
  ├── trial.enc          ← encrypted first launch date
  ├── database.sqlite    ← restaurant data
  └── uploads/           ← product images and file uploads
```

`api-core` must respect `UPLOADS_PATH` env var (set by Electron at spawn) to write uploads to `userData/uploads/` rather than `process.cwd()/uploads`. This ensures images survive app updates.

### Auto-updates

- `electron-updater` checks for updates from GitHub Releases
- Update is downloaded in the background
- User sees: "Update available — will install on next restart"
- No forced restarts during service hours
- Both the initial release and all update artifacts must be notarized (macOS) — automate via CI/CD (e.g., GitHub Actions with `notarize` step)

---

## Code Signing

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Signed + notarized | Uses existing Apple Developer certificate via `electron-builder`. All update artifacts must also be notarized. |
| Windows | Unsigned (for now) | SmartScreen warning shown; user clicks "More info → Run anyway". Acceptable for direct sales. |

---

## Out of Scope

- License management dashboard (manual tracking in spreadsheet)
- Windows code signing certificate (deferred until revenue justifies cost)
- Multi-seat licenses (one license = one machine only)
- Online-only features beyond initial activation
