# Electron macOS Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the Electron tray app as a signed and notarized macOS DMG, with JWT_SECRET auto-generated on first launch so no manual `.env` setup is required by end users.

**Architecture:** Add `src/config/app-config.ts` to generate and persist JWT_SECRET in `userData/config.json`. Modify `main.ts` to inject the secret before spawning the backend. Update `electron-builder.yml` with hardenedRuntime and entitlements for notarization. Build pipeline: binary → unsigned DMG (smoke test) → signed + notarized DMG.

**Tech Stack:** Electron 32, electron-builder 25, TypeScript, Node.js `crypto`, `electron-builder` notarization via Apple credentials env vars.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/desktop/src/config/app-config.ts` | Create | Read/write `userData/config.json`, generate jwtSecret |
| `apps/desktop/src/main.ts` | Modify (lines 21–39) | Load config, inject JWT_SECRET before startServer |
| `apps/desktop/src/server/spawn.ts` | Modify (lines 77–79) | Remove hard JWT_SECRET env guard |
| `apps/desktop/resources/entitlements.mac.plist` | Create | hardenedRuntime permissions for Node.js binary |
| `apps/desktop/electron-builder.yml` | Modify | Add hardenedRuntime + entitlements + notarize |

---

## Task 1: Auto-generate JWT_SECRET on first launch

**Files:**
- Create: `apps/desktop/src/config/app-config.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/server/spawn.ts`

- [ ] **Step 1: Create `apps/desktop/src/config/app-config.ts`**

```typescript
import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

interface AppConfig {
  jwtSecret: string;
}

function isValidConfig(data: unknown): data is AppConfig {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Record<string, unknown>).jwtSecret === 'string' &&
    (data as AppConfig).jwtSecret.length > 0
  );
}

export function getOrCreateAppConfig(): AppConfig {
  const userData = app.getPath('userData');
  const configPath = join(userData, 'config.json');

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      if (isValidConfig(raw)) return raw;
    } catch {
      // Fall through to regenerate
    }
  }

  const config: AppConfig = {
    jwtSecret: randomBytes(32).toString('hex'),
  };

  mkdirSync(userData, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log(`[app-config] Generated new config at ${configPath}`);
  return config;
}
```

- [ ] **Step 2: Modify `apps/desktop/src/main.ts` — inject JWT_SECRET before startServer**

Replace the `app.whenReady()` block (currently lines 21–39) with:

```typescript
app.whenReady().then(async () => {
  // Register auto-start on boot (login item)
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });

  // Load or generate persistent app config
  const { getOrCreateAppConfig } = await import('./config/app-config');
  const appConfig = getOrCreateAppConfig();
  // Only set if not already provided via .env (dev mode override)
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = appConfig.jwtSecret;
  }

  createTray();

  try {
    const url = await startServer();
    setTrayStatus('running');
    await shell.openExternal(url);
  } catch (err) {
    console.error('[main] Failed to start server:', err);
    stopServer();
    app.quit();
  }
});
```

Also add the import at the top of the file (after the existing imports):
```typescript
// (no static import needed — using dynamic import inside whenReady)
```

- [ ] **Step 3: Remove the JWT_SECRET guard from `apps/desktop/src/server/spawn.ts`**

Remove lines 77–79 (the block that throws if JWT_SECRET is missing):

```typescript
// DELETE these lines:
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in .env when spawning the binary');
  }
```

After removal, the `env` object starts directly at:
```typescript
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    ...
```

- [ ] **Step 4: Compile and verify TypeScript**

```bash
cd apps/desktop
npx tsc --noEmit false
```

Expected: no errors, `dist/` updated.

- [ ] **Step 5: Verify config.json is created**

With `ELECTRON_DEV_BACKEND` still set in `.env`, run the app:

```bash
pnpm dev
```

Then check:
```bash
cat ~/Library/Application\ Support/Restaurantes/config.json
```

Expected output:
```json
{
  "jwtSecret": "<64-char hex string>"
}
```

Run `pnpm dev` again — confirm the same `jwtSecret` value (not regenerated).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/config/app-config.ts apps/desktop/src/main.ts apps/desktop/src/server/spawn.ts
git commit -m "feat(desktop): auto-generate JWT_SECRET on first launch, persist in userData/config.json"
```

---

## Task 2: Binary mode smoke test

No code changes — this is a manual verification that the binary spawns correctly before packaging.

**Files:** none

- [ ] **Step 1: Comment out ELECTRON_DEV_BACKEND in `.env`**

In `apps/desktop/.env`, comment out (or remove) the line:
```bash
# ELECTRON_DEV_BACKEND=http://localhost:3000
```

Make sure `JWT_SECRET` is also commented out (so the auto-generated one is used).

- [ ] **Step 2: Verify the binary exists**

```bash
ls -lh apps/api-core/dist-binary/
```

Expected: `api-core-node22-macos-arm64` present. If missing, build it first:
```bash
pnpm --filter @restaurants/api-core build && pnpm build:desktop
```

- [ ] **Step 3: Run in binary mode**

```bash
cd apps/desktop
pnpm dev
```

Expected:
- Console shows `[spawn] Starting binary: .../api-core-node22-macos-arm64 on port <XXXX>`
- Console shows `[api-core]` log lines from NestJS
- Console shows `[spawn] Backend ready at http://localhost:<XXXX>`
- System browser opens to `http://localhost:<XXXX>`
- Dashboard loads and is functional

If the binary fails, check the logs for `[api-core]` error output. Common issue: binary needs execute permissions.

```bash
chmod +x apps/api-core/dist-binary/api-core-node22-macos-arm64
```

- [ ] **Step 4: Restore ELECTRON_DEV_BACKEND for dev convenience**

```bash
# In apps/desktop/.env — restore for normal development:
ELECTRON_DEV_BACKEND=http://localhost:3000
```

---

## Task 3: electron-builder packaging config

**Files:**
- Create: `apps/desktop/resources/entitlements.mac.plist`
- Modify: `apps/desktop/electron-builder.yml`

- [ ] **Step 1: Create `apps/desktop/resources/entitlements.mac.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

These permissions are required because the NestJS binary embeds Node.js, which uses JIT compilation and needs to execute unsigned memory regions.

- [ ] **Step 2: Replace `apps/desktop/electron-builder.yml` with the full config**

```yaml
appId: com.restaurants.desktop
productName: Restaurantes
directories:
  output: dist-electron
files:
  - dist/**/*
extraResources:
  - from: ../../apps/api-core/dist-binary/
    to: bin/
    filter:
      - "api-core-*"
  - from: resources/
    to: resources/
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
  notarize: true
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: resources/icon.ico
publish: null
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/resources/entitlements.mac.plist apps/desktop/electron-builder.yml
git commit -m "feat(desktop): add hardenedRuntime entitlements and notarization config for macOS packaging"
```

---

## Task 4: Build and test unsigned DMG

Build the DMG without signing credentials to verify the packaging itself works before adding signing complexity.

**Files:** none (build only)

- [ ] **Step 1: Build the NestJS binary (if not already built)**

```bash
pnpm --filter @restaurants/api-core build && pnpm build:desktop
```

Expected: `apps/api-core/dist-binary/api-core-node22-macos-arm64` present (~90MB).

- [ ] **Step 2: Build the DMG without signing**

Temporarily disable signing for this test by running with `CSC_IDENTITY_AUTO_DISCOVERY=false`:

```bash
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64
```

Expected output ends with something like:
```
  • building        target=DMG arch=arm64 file=dist-electron/Restaurantes-1.0.0-arm64.dmg
```

- [ ] **Step 3: Mount and test the DMG**

```bash
open dist-electron/Restaurantes-1.0.0-arm64.dmg
```

Drag `Restaurantes.app` to `/Applications`. Open it.

macOS will warn: *"Restaurantes can't be opened because it is from an unidentified developer"*.

Go to **System Settings → Privacy & Security → scroll down → click "Open Anyway"**.

Expected behavior:
- Tray icon appears in menu bar
- Browser opens with dashboard
- Logs visible in Console.app (search "Restaurantes")

- [ ] **Step 4: Verify database persistence**

Open dashboard, create a test record (e.g., a product). Quit the app from the tray. Reopen.

Expected: the record persists. Check database location:
```bash
ls ~/Library/Application\ Support/Restaurantes/
```

Expected files: `config.json`, `database.sqlite`, `uploads/`

- [ ] **Step 5: Cleanup test install**

```bash
rm -rf /Applications/Restaurantes.app
```

---

## Task 5: Build signed and notarized DMG

**Prerequisites:** Apple Developer Program account, `Developer ID Application` certificate installed in Keychain.

**Files:** none (env vars only)

- [ ] **Step 1: Get your Apple credentials**

You need three values:

1. **Apple ID** — your developer email (e.g. `tu@email.com`)
2. **App-specific password** — create at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords → Generate
3. **Team ID** — find at [developer.apple.com](https://developer.apple.com) → Account → Membership Details → Team ID (format: `XXXXXXXXXX`)

Verify the `Developer ID Application` certificate is in your Keychain:
```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

Expected: at least one line with `Developer ID Application: <Your Name> (<TEAM_ID>)`

- [ ] **Step 2: Set signing env vars in your shell**

```bash
export APPLE_ID="tu@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Replace values with your actual credentials. Do NOT commit these to the repo.

- [ ] **Step 3: Build signed + notarized DMG**

```bash
cd apps/desktop
npx electron-builder --mac --arm64
```

This will:
1. Compile and package the app
2. Sign with `codesign` using your `Developer ID Application` cert
3. Upload to Apple for notarization (takes 1–5 minutes)
4. Staple the notarization ticket to the DMG

Watch for these log lines:
```
  • signing         file=dist-electron/mac-arm64/Restaurantes.app
  • notarizing      appId=com.restaurants.desktop
  • notarized
```

- [ ] **Step 4: Verify the DMG is properly signed and notarized**

```bash
# Check the app signature
codesign --verify --deep --strict --verbose=2 dist-electron/mac-arm64/Restaurantes.app

# Check notarization
spctl --assess --type exec --verbose dist-electron/mac-arm64/Restaurantes.app
```

Expected from `spctl`:
```
dist-electron/mac-arm64/Restaurantes.app: accepted
source=Notarized Developer ID
```

- [ ] **Step 5: Install and test the signed DMG**

```bash
open dist-electron/Restaurantes-1.0.0-arm64.dmg
```

Drag to Applications, open. This time macOS should open it **without any security warning**.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/resources/ apps/desktop/electron-builder.yml
git commit -m "feat(desktop): verified signed and notarized macOS DMG build"
```

> Note: never commit `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, or `APPLE_TEAM_ID` to the repo.
