# Electron macOS Packaging Design

**Goal:** Produce a signed and notarized `.dmg` installer for macOS that runs the NestJS backend as a standalone binary and opens the dashboard in the system browser.

**Architecture:** Electron tray app (already implemented) packaged via `electron-builder`. JWT_SECRET is auto-generated on first launch and persisted in `userData/config.json`. The NestJS binary is bundled as an `extraResource` and spawned at runtime. Code signing and notarization use Apple Developer credentials via `electron-builder`'s built-in support.

**Tech Stack:** Electron 32, electron-builder 25, TypeScript, macOS `codesign` + `notarytool` (via electron-builder), Node.js `crypto` for secret generation.

---

## Scope

macOS only. Windows packaging is out of scope for this iteration.

This spec does NOT cover:
- License/trial system (separate future spec)
- Auto-update (future)
- Windows signing

---

## Components

### 1. `src/config/app-config.ts` (new file)

Reads or creates `userData/config.json` on first launch. Responsible for generating and persisting the JWT secret.

```typescript
interface AppConfig {
  jwtSecret: string;
}

export function getOrCreateAppConfig(): AppConfig
```

**Behavior:**
- Reads `{userData}/config.json`
- If missing or malformed: generates `crypto.randomBytes(32).toString('hex')` as `jwtSecret`, writes file, returns config
- If valid: returns existing config

The `userData` path on macOS is `~/Library/Application Support/Restaurantes/`. It is writable and persists across app updates.

### 2. `src/main.ts` (modify)

Load app config before calling `startServer()`. Inject `JWT_SECRET` into `process.env` so `spawn.ts` picks it up.

**Changes:**
- Import and call `getOrCreateAppConfig()` inside `app.whenReady()`
- Set `process.env.JWT_SECRET = config.jwtSecret` before `startServer()`
- Remove the now-redundant comment about `JWT_SECRET` being required in `.env`

`.env` still works in dev mode — if `JWT_SECRET` is set in `.env`, it takes precedence because `dotenv` runs first (at module load). `app-config.ts` only writes to `process.env` if it's not already set.

### 3. `src/server/spawn.ts` (modify)

Remove the hard guard that throws if `JWT_SECRET` is not in the environment:

```typescript
// Remove this block:
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in .env when spawning the binary');
}
```

The secret is now guaranteed to be present because `main.ts` sets it before calling `startServer()`.

### 4. `electron-builder.yml` (modify)

Add macOS signing and notarization configuration:

```yaml
mac:
  category: public.app-category.business
  target:
    - target: dmg
      arch:
        - arm64
        - x64
  icon: resources/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist
  notarize:
    teamId: ${APPLE_TEAM_ID}
```

### 5. `resources/entitlements.mac.plist` (new file)

Required for `hardenedRuntime`. The NestJS binary runs Node.js internally, which needs JIT and unsigned memory execution:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
```

---

## Build Process

### Step 1 — Binary mode smoke test (local, no packaging)

Before packaging, verify the binary spawns correctly without `ELECTRON_DEV_BACKEND`:

```bash
# In apps/desktop/.env — comment out or remove:
# ELECTRON_DEV_BACKEND=http://localhost:3000

# Run dev mode — Electron will spawn the binary
cd apps/desktop
pnpm dev
```

Expected: browser opens at `http://localhost:<dynamic-port>`, dashboard loads, logs show `[api-core]` output.

### Step 2 — Build unsigned DMG (validate packaging)

```bash
# From repo root — build the NestJS binary first
pnpm --filter @restaurants/api-core build && pnpm build:desktop

# Build the DMG (unsigned)
pnpm --filter @restaurants/desktop dist:mac
```

Output: `apps/desktop/dist-electron/Restaurantes-1.0.0-arm64.dmg`

Test by mounting the DMG and running the app. macOS will warn about unidentified developer — click "Open Anyway" in System Settings → Privacy & Security.

### Step 3 — Build signed + notarized DMG

Set environment variables (add to shell profile or CI secrets):

```bash
export APPLE_ID="tu@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # from appleid.apple.com
export APPLE_TEAM_ID="XXXXXXXXXX"                           # from developer.apple.com
```

Then build:

```bash
pnpm --filter @restaurants/desktop dist:mac
```

`electron-builder` signs the `.app`, notarizes with Apple, and staples the ticket automatically. The resulting DMG installs without any Gatekeeper warning.

---

## Environment Variables

### Dev mode (`.env` in `apps/desktop/`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET` | No | If set, takes precedence over auto-generated secret |
| `TZ` | No | Timezone for binary (default: UTC) |
| `ELECTRON_DEV_BACKEND` | No | Connect to running NestJS instead of spawning binary |

### Build time (shell env for signing)

| Variable | Required | Purpose |
|----------|----------|---------|
| `APPLE_ID` | Yes (signing) | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | Yes (signing) | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Yes (signing) | Team ID from developer.apple.com |

---

## Data Persistence

The app stores data in `~/Library/Application Support/Restaurantes/`:

| File/Dir | Contents |
|----------|---------|
| `config.json` | `{ "jwtSecret": "..." }` — generated on first launch |
| `database.sqlite` | SQLite database (created by NestJS on first launch) |
| `uploads/` | Uploaded files (images, etc.) |

This directory survives app updates and uninstalls (unless the user manually deletes it).

---

## What This Does NOT Change

- NestJS backend (`api-core`) — unchanged, reads its own env vars in cloud/Railway
- `ELECTRON_DEV_BACKEND` dev workflow — still works exactly as before
- Cloud/Railway deployment — unaffected, no shared code path

---

## Out of Scope (Future)

- Windows packaging and signing (EV certificate required for SmartScreen)
- Auto-update (`electron-updater`)
- License/trial system
- Electron Fuses (security hardening, separate task)
