# Desktop Packaging, Cloud Distribution & License System — Design Spec

**Date:** 2026-03-18
**Status:** Draft

## Overview

Convert the existing NestJS + Astro restaurant management system into a distributable product with two independent delivery modes, both sold with source-code protection:

1. **Desktop (Electron)** — one-time license, local LAN install at the restaurant
2. **Cloud SaaS** — owner-managed Railway deployment per client, required for integrations that need a public HTTPS endpoint (payment webhooks, etc.)

The obfuscation and binary compilation is a **shared build step** decoupled from both distribution modes, so the same protected artifact is consumed by the desktop packager and the cloud deployment pipeline.

---

## Goals

- Two distribution modes: desktop (Electron) and cloud SaaS (Railway)
- Protect source code in both modes via obfuscation + bytecode compilation
- Desktop: one-time license with hardware binding and 15-day trial
- Cloud: instance-level license key (no hardware binding)
- macOS installer signed and notarized (existing Apple Developer certificate)
- Windows installer unsigned for now (SmartScreen warning acceptable)
- Auto-start on boot for desktop mode; no manual intervention required
- Simple manual license management (spreadsheet, no dashboard)

---

## Monorepo Structure

```
apps/
├── api-core/          # NestJS backend (existing)
├── ui-dashboard/      # Astro dashboard (existing)
├── ui-storefront/     # Astro kiosk (existing)
├── desktop/           # Electron wrapper (new)
└── license-server/    # NestJS license API (new)

packages/
└── build-tools/       # Shared obfuscation + bytecode compilation scripts (new)
    ├── scripts/
    │   ├── obfuscate.ts        # javascript-obfuscator step
    │   ├── compile-bytecode.ts # bytenode → .jsc (for cloud)
    │   └── compile-binary.ts   # @yao-pkg/pkg → standalone binary (for desktop)
    └── package.json
```

---

## Distribution Modes

### Mode 1 — Desktop (Electron)

```
PC del restaurante
└── restaurant-pos.exe / .app   (Electron)
    ├── Electron main process
    │   ├── License Guard (lee license.enc, verifica RSA offline)
    │   ├── Spawns NestJS standalone binary (localhost:{PORT})
    │   └── Opens BrowserWindow → localhost:{PORT}
    └── NestJS standalone binary (api-core compiled by @yao-pkg/pkg)
        ├── REST API + Socket.IO
        ├── SQLite (better-sqlite3) in userData/
        └── ServeStaticModule → ui-dashboard/dist/ + ui-storefront/dist/

Tablet kiosk (LAN)    → browser → 192.168.x.x:{PORT}/storefront
Pantalla cocina (LAN) → browser → 192.168.x.x:{PORT}/kitchen
Dashboard adicional   → browser → 192.168.x.x:{PORT}
```

### Mode 2 — Cloud SaaS

```
Railway (por cliente o instancia compartida)
└── Docker container
    └── NestJS bytecode (bytenode .jsc, requires Node.js runtime)
        ├── REST API + Socket.IO (HTTPS via Railway domain)
        ├── PostgreSQL (Railway-managed)
        └── ServeStaticModule → static Astro files

Dispositivos del cliente → browser → https://cliente.railway.app
Payment webhooks        → POST https://cliente.railway.app/webhooks/...
```

The owner deploys and manages cloud instances. The client never has access to source code or binary files.

---

## Shared Build Step (`packages/build-tools`)

This package runs before either distribution mode is packaged. It produces two protected artifacts from the same NestJS source:

```
STEP 1 — Compile NestJS TypeScript
  nest build → apps/api-core/dist/

STEP 2 — Obfuscate (conservative settings)
  javascript-obfuscator dist/ → dist-obfuscated/
  Settings: renameGlobals:false, stringArray:true, rotateStringArray:true,
            deadCodeInjection:false
  (NestJS reflect-metadata and decorator metadata must survive transformation)

STEP 3a — Bytecode for cloud (bytenode)
  bytenode --compile dist-obfuscated/**/*.js → dist-bytecode/ (.jsc files)
  Requires Node.js runtime on the target server.
  Used by: cloud SaaS deployment

STEP 3b — Standalone binary for desktop (@yao-pkg/pkg)
  @yao-pkg/pkg dist-obfuscated/main.js → api-core-{platform}
  Targets: node22-win-x64, node22-macos-x64, node22-macos-arm64
  Embeds Node.js — no runtime required on the client machine.
  Used by: Electron desktop app

Turborepo scripts:
  turbo run build:protected:cloud    → runs steps 1 + 2 + 3a
  turbo run build:protected:desktop  → runs steps 1 + 2 + 3b
```

**Note on native addons:** `better-sqlite3` and the Prisma query engine are native `.node` binaries that cannot be bundled inside `pkg`'s virtual filesystem. They must be extracted to `resources/` alongside the binary and resolved at runtime via:
- `BETTER_SQLITE3_BINDING`: path to `better-sqlite3.node`
- `PRISMA_QUERY_ENGINE_LIBRARY`: path to the Prisma engine binary

**Note on `@yao-pkg/pkg`:** The original `pkg` by Vercel was archived in 2023 (Node 18 max). `@yao-pkg/pkg` is the community-maintained fork with Node 22 support.

**Note on obfuscation + NestJS:** Test the obfuscated build end-to-end before shipping. Aggressive obfuscation settings break decorator metadata reflection.

---

## Full Build Pipelines

### Desktop build pipeline

```
1. build frontends (static)
   astro build (ui-dashboard)  → dist/   [HTML/CSS/JS]
   astro build (ui-storefront) → dist/   [HTML/CSS/JS]
   copy both dists → apps/api-core/public/

2. build:protected:desktop (packages/build-tools)
   → api-core-{platform} standalone binary

3. assemble Electron app
   apps/desktop/resources/
     ├── api-core-{platform}      (NestJS standalone binary)
     ├── better-sqlite3.node      (native addon)
     ├── prisma-query-engine      (Prisma engine binary)
     ├── public/                  (Astro static files)
     └── rsa-public.pem           (embedded RSA public key for license verification)

4. electron-builder
   macOS → .dmg  (signed + notarized via Apple Developer certificate)
   Windows → .exe installer (no signing at this stage)
   Encrypted .asar packaging
   Electron Fuses: disable DevTools, disable remote debugging in production

   ⚠️ Auto-update artifacts must also pass Apple notarization (automate in CI/CD)
```

### Cloud build pipeline

```
1. build frontends (static) — same as desktop step 1

2. build:protected:cloud (packages/build-tools)
   → dist-bytecode/ (.jsc files)

3. Docker image
   FROM node:22-alpine
   COPY dist-bytecode/ ./
   COPY public/ ./public/
   COPY prisma/ ./prisma/
   CMD ["node", "-r", "bytenode", "main.jsc"]

4. Deploy to Railway
   → per-client project or shared instance
   → Railway-managed PostgreSQL
   → HTTPS domain provided by Railway
```

---

## Required: Convert Astro apps to static output

Both `ui-dashboard` and `ui-storefront` currently use `output: 'server'` with the Node adapter. Both must be changed to `output: 'static'` with the Node adapter removed. Both UIs are client-side applications — all dynamic data fetching hits the NestJS API directly from the browser.

**Three pages currently use `prerender = false` and read `Astro.params` server-side.** These require moving parameter reading to client-side `window.location.pathname` parsing before the static conversion works:

- `apps/ui-dashboard/src/pages/dash/menus/[id].astro` — reads `Astro.params.id`
- `apps/ui-dashboard/src/pages/kitchen/[slug].astro` — dynamic route with `prerender = false`
- `apps/ui-storefront/src/pages/kiosk/[slug].astro` — reads `Astro.params.slug`

In all three cases the parameter is already consumed by a client-side `<script>` block reading `dataset.*`, so the migration is mechanical.

---

## License System (`apps/license-server`)

A minimal NestJS API deployed to Railway. No UI. Owner accesses it manually via API calls to generate and manage keys.

### Database

**Production (Railway):** PostgreSQL (Railway-managed). SQLite must not be used on Railway due to ephemeral filesystem.
**Local development:** SQLite.

### Schema

```sql
licenses (
  key          TEXT PRIMARY KEY,   -- XXXX-XXXX-XXXX-XXXX
  machine_id   TEXT,               -- null until activated (desktop only)
  platform     TEXT,               -- 'win32' | 'darwin' | 'cloud'
  mode         TEXT,               -- 'desktop' | 'cloud'
  activated_at DATETIME,
  status       TEXT                -- 'available' | 'active' | 'revoked'
)
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/licenses/generate` | API key (owner) | Generate a new license key |
| POST | `/licenses/activate` | None | Validate key + bind to hardware (desktop) or instance (cloud) |
| POST | `/licenses/deactivate` | API key (owner) | Revoke or free a machine slot (support use) |
| GET | `/licenses/:key/status` | API key (owner) | Check license status |

### Hardware Fingerprint (desktop mode only)

Uses `node-machine-id` to obtain a stable OS-level UUID (based on hardware identifiers, more stable than MAC+CPU+hostname). Single value, no tolerance model needed — if the machine changes, the owner deactivates the old machine via `/deactivate` and the customer reactivates on the new one.

Cloud mode uses the license key itself as the instance identifier — no hardware binding.

### Activation Flow (desktop)

```
App                          License Server (Railway)
 │                                    │
 │  POST /activate                    │
 │  { licenseKey, machineId,          │
 │    platform: 'win32'|'darwin' } ──►│  verify key exists + not revoked
 │                                    │  verify machineId not bound elsewhere
 │◄── { token: JWT signed RSA-256 } ──│  register machineId + activatedAt
 │                                    │
 │  stores token in userData/license.enc (AES-256 encrypted)
```

### Offline Verification (every subsequent launch)

```typescript
// No internet required
const token = readAndDecrypt('userData/license.enc')
const payload = jwt.verify(token, RSA_PUBLIC_KEY)  // public key embedded in binary
assert(payload.machineId === getMachineId())        // prevents license.enc copying
// Pass → start NestJS
```

**RSA asymmetric signing:** The private key lives only on the license server. The public key is embedded in the Electron binary (in `resources/rsa-public.pem`). Extracting the public key from the binary does not allow forging tokens — only the server can sign new ones. This is significantly stronger than symmetric JWT.

---

## Trial Period (desktop only)

- On first launch without a license token, records `firstLaunchAt` in:
  1. `userData/trial.enc` (AES-256 encrypted)
  2. OS-level backup: Windows Registry key / macOS Keychain
- Every launch uses the earliest date found across both stores
- `≤ 15 days` → app runs normally, banner: "X days remaining in trial"
- `> 15 days` → activation screen shown; NestJS does not start
- Deleting `trial.enc` alone does not reset the trial (OS store persists)

---

## Electron App (`apps/desktop`)

### Required code change in `api-core`

- Add `GET /health` endpoint returning `{ status: 'ok' }` — Electron polls this to detect when NestJS is ready
- Respect `UPLOADS_PATH` env var for file upload directory (defaults to `process.cwd()/uploads` today; must write to `userData/uploads/` in desktop mode)

### Lifecycle

```
System boot
  └── Electron auto-launches (registered at install time)
        └── Validates license/trial locally (RSA offline check)
        └── Spawns NestJS standalone binary on random available port
            env vars: PRISMA_QUERY_ENGINE_LIBRARY, BETTER_SQLITE3_BINDING,
                      DATABASE_URL=file:///userData/database.sqlite,
                      FRONTEND_URL=http://localhost:{PORT},
                      UPLOADS_PATH=userData/uploads/
        └── Polls http://localhost:{PORT}/health every 500ms
        └── Runs prisma migrate deploy (on first launch of each new version)
        └── Opens BrowserWindow once health check passes
```

### System Tray

Always visible:
- "Open dashboard"
- "Server status: running ✓"
- "Quit" — terminates the NestJS process and exits Electron completely

Closing the BrowserWindow (X button) hides the window but keeps NestJS running. The server continues accepting LAN orders while no window is visible. Only the tray "Quit" fully shuts down the service.

### User Data Directory

```
userData/  (OS-managed, persists across app updates)
  ├── license.enc       ← RSA-verified activation token (AES encrypted)
  ├── trial.enc         ← first launch timestamp (AES encrypted)
  ├── database.sqlite   ← restaurant data
  └── uploads/          ← product images and file uploads
```

### Protection Layers

| Layer | Tool | What it protects | Effectiveness |
|-------|------|-----------------|---------------|
| 1 | javascript-obfuscator | Renames vars, encrypts strings, injects dead code | Medium |
| 2 | bytenode / @yao-pkg/pkg | Compiles JS → V8 bytecode or standalone binary | High |
| 3 | Encrypted .asar | Protects Electron assets from extraction | Medium |
| 4 | Electron Fuses | Disables DevTools and remote debugger in production | Medium |
| 5 | RSA server signing | Token valid only if generated by your server; real business barrier | Very High |

The goal is not perfect protection but raising the cost of cracking above the cost of a license.

---

## Code Signing

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Signed + notarized | Apple Developer certificate via `electron-builder`. All auto-update artifacts must also be notarized — automate in CI/CD. |
| Windows | Unsigned (for now) | SmartScreen warning; user clicks "More info → Run anyway". Acceptable for direct sales. |

---

## Prisma Migration Strategy

The project currently uses `db push` for local development and has no `prisma/migrations/` directory.

**One-time setup before first desktop build:** run `prisma migrate dev --name init` to generate the initial migration file. All subsequent schema changes must use `prisma migrate dev` (not `db push`) to maintain the migration history.

At desktop startup, `prisma migrate deploy` runs automatically before NestJS starts — ensuring the schema is up to date after any app update without losing existing data.

---

## Verification Checklist

1. **Trial:** Install binary, verify it starts without a key. Delete `trial.enc` → verify OS keychain backup keeps the original date.
2. **Trial expiry:** Set `firstLaunchAt` to 16 days ago → verify activation screen appears and NestJS does not start.
3. **Activation:** Run license server locally, activate with a test key → verify token is saved. Disconnect internet → verify app starts normally.
4. **Anti-copy:** Copy `license.enc` to another machine → verify `machineId` mismatch blocks startup.
5. **Double activation:** Attempt to activate the same key on two machines → verify 409 error.
6. **Obfuscation:** Extract `app.asar` → verify `.jsc` files are unreadable and entry files are obfuscated.
7. **Cloud:** Deploy Docker image to Railway → verify app starts, serves static files, and HTTPS webhooks reach the instance.
8. **Migrations:** Install old version, add data, install new version with schema change → verify data survives and schema is updated.

---

## Out of Scope

- License management dashboard (manual tracking in spreadsheet)
- Windows code signing certificate (deferred until revenue justifies cost)
- Multi-seat licenses (one license = one machine only, for desktop)
- Self-hosted binary distribution for cloud (future mode)
