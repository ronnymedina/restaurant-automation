# Desktop Distribution — Plan 3: Electron App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/desktop` — the Electron shell that wraps the NestJS binary, manages the system tray, enforces license/trial validation, and produces signed installers for macOS and Windows.

**Architecture:** Electron main process spawns the NestJS standalone binary as a child process. License guard validates the RSA-signed activation token offline on every launch. Trial state is stored in two places (encrypted file + OS-level store) to prevent tampering. electron-builder produces `.dmg` (signed + notarized) and `.exe` (unsigned).

**Tech Stack:** Electron 32, electron-builder, electron-updater, node-machine-id, `@electron/fuses`, AES-256 (built-in Node crypto), RSA JWT verification (jsonwebtoken), auto-launch

**Spec:** `docs/superpowers/specs/2026-03-18-desktop-packaging-design.md`

**Prerequisites:**
- Plan 1 completed (NestJS binary builds successfully, `apps/desktop/resources/public.pem` exists)
- Plan 2 completed (license server deployed, RSA public key in `apps/desktop/resources/public.pem`)

---

## File Map

**Created (`apps/desktop/`):**
- `package.json`
- `tsconfig.json`
- `electron-builder.yml`
- `src/main.ts` — Electron main process entry
- `src/preload.ts` — preload script (minimal)
- `src/license/machine-id.ts` — get stable machine UUID
- `src/license/crypto.ts` — AES-256 encrypt/decrypt helpers
- `src/license/trial.ts` — trial period storage and check
- `src/license/activation.ts` — RSA JWT load and verify
- `src/license/license-guard.ts` — orchestrates trial + activation check
- `src/server/spawn.ts` — spawn NestJS binary, poll /health
- `src/tray/tray.ts` — system tray setup
- `resources/public.pem` — RSA public key (from Plan 2)
- `resources/icon.png` / `resources/icon.icns` / `resources/icon.ico` — app icons
- `resources/activate.html` — standalone activation/trial-expired page

---

## Task 1: Scaffold `apps/desktop`

- [ ] **Step 1.1: Create package.json**

```json
// apps/desktop/package.json
{
  "name": "@restaurants/desktop",
  "version": "1.0.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "electron .",
    "dev": "tsc && electron .",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "electron-updater": "^6.3.0",
    "jsonwebtoken": "^9.0.0",
    "node-machine-id": "^1.1.12",
    "auto-launch": "^5.0.5"
  },
  "devDependencies": {
    "@electron/fuses": "^1.8.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/node": "^22.0.0",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 1.2: Create tsconfig.json**

```json
// apps/desktop/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 1.3: Install dependencies**

```bash
cd apps/desktop && pnpm install
```

- [ ] **Step 1.4: Commit**

```bash
git add apps/desktop/package.json apps/desktop/tsconfig.json
git commit -m "feat(desktop): scaffold Electron app"
```

---

## Task 2: Machine ID and crypto helpers

**Files:**
- Create: `apps/desktop/src/license/machine-id.ts`
- Create: `apps/desktop/src/license/crypto.ts`

These are pure utility functions — easy to test without Electron.

- [ ] **Step 2.1: Create machine-id.ts**

```typescript
// apps/desktop/src/license/machine-id.ts
import { machineIdSync } from 'node-machine-id';

/**
 * Returns a stable UUID derived from OS hardware identifiers.
 * Same machine always returns the same ID.
 */
export function getMachineId(): string {
  return machineIdSync(true); // true = hash the raw ID for privacy
}
```

- [ ] **Step 2.2: Create crypto.ts**

```typescript
// apps/desktop/src/license/crypto.ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Derives a 32-byte key from the machine ID so the encryption key
// is tied to the hardware — moving the file to another machine won't decrypt.
function deriveKey(machineId: string): Buffer {
  return scryptSync(machineId, 'restaurant-pos-salt', 32) as Buffer;
}

export function encrypt(plaintext: string, machineId: string): string {
  const key = deriveKey(machineId);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all hex)
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(ciphertext: string, machineId: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const key = deriveKey(machineId);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}
```

- [ ] **Step 2.3: Commit**

```bash
git add apps/desktop/src/license/
git commit -m "feat(desktop): add machine-id and AES-256-GCM crypto helpers"
```

---

## Task 3: Trial period management

**Files:**
- Create: `apps/desktop/src/license/trial.ts`

- [ ] **Step 3.1: Create trial.ts**

```typescript
// apps/desktop/src/license/trial.ts
import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { encrypt, decrypt } from './crypto';
import { getMachineId } from './machine-id';

const TRIAL_DAYS = 15;
const TRIAL_FILE = 'trial.enc';

function getTrialFilePath(): string {
  return join(app.getPath('userData'), TRIAL_FILE);
}

// OS-level backup key name
const OS_STORE_KEY = 'restaurant-pos-trial';

function readOsStore(): string | null {
  try {
    if (process.platform === 'darwin') {
      const { execSync } = require('child_process');
      const result = execSync(
        `security find-generic-password -a "restaurant-pos" -s "${OS_STORE_KEY}" -w`,
        { stdio: ['pipe', 'pipe', 'ignore'] },
      );
      return result.toString().trim() || null;
    } else if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      const result = execSync(
        `reg query "HKCU\\Software\\RestaurantPOS" /v TrialStart`,
        { stdio: ['pipe', 'pipe', 'ignore'] },
      );
      const match = result.toString().match(/TrialStart\s+REG_SZ\s+(.+)/);
      return match ? match[1].trim() : null;
    }
  } catch {
    return null;
  }
  return null;
}

function writeOsStore(isoDate: string): void {
  try {
    if (process.platform === 'darwin') {
      const { execSync } = require('child_process');
      execSync(
        `security add-generic-password -a "restaurant-pos" -s "${OS_STORE_KEY}" -w "${isoDate}" 2>/dev/null || security delete-generic-password -a "restaurant-pos" -s "${OS_STORE_KEY}" 2>/dev/null; security add-generic-password -a "restaurant-pos" -s "${OS_STORE_KEY}" -w "${isoDate}"`,
      );
    } else if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      execSync(
        `reg add "HKCU\\Software\\RestaurantPOS" /v TrialStart /t REG_SZ /d "${isoDate}" /f`,
      );
    }
  } catch {
    // non-fatal — file-based trial still works
  }
}

export type TrialStatus =
  | { valid: true; daysLeft: number }
  | { valid: false };

export function checkTrial(): TrialStatus {
  const machineId = getMachineId();
  const trialPath = getTrialFilePath();

  let firstLaunchAt: Date | null = null;

  // Read from file
  if (existsSync(trialPath)) {
    try {
      const iso = decrypt(readFileSync(trialPath, 'utf8'), machineId);
      firstLaunchAt = new Date(iso);
    } catch {
      // Tampered or corrupted — treat as missing
    }
  }

  // Read from OS store
  const osIso = readOsStore();
  if (osIso) {
    const osDate = new Date(osIso);
    if (!firstLaunchAt || osDate < firstLaunchAt) {
      firstLaunchAt = osDate; // always use the earliest date
    }
  }

  // First ever launch — record the date
  if (!firstLaunchAt) {
    firstLaunchAt = new Date();
    const iso = firstLaunchAt.toISOString();
    mkdirSync(join(app.getPath('userData')), { recursive: true });
    writeFileSync(trialPath, encrypt(iso, machineId), 'utf8');
    writeOsStore(iso);
  }

  const daysElapsed = Math.floor(
    (Date.now() - firstLaunchAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysLeft = TRIAL_DAYS - daysElapsed;

  return daysLeft > 0 ? { valid: true, daysLeft } : { valid: false };
}
```

- [ ] **Step 3.2: Commit**

```bash
git add apps/desktop/src/license/trial.ts
git commit -m "feat(desktop): add trial period management with OS-level backup"
```

---

## Task 4: License activation (RSA JWT verification)

**Files:**
- Create: `apps/desktop/src/license/activation.ts`

- [ ] **Step 4.1: Create activation.ts**

```typescript
// apps/desktop/src/license/activation.ts
import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { verify, JwtPayload } from 'jsonwebtoken';
import { encrypt, decrypt } from './crypto';
import { getMachineId } from './machine-id';

const LICENSE_FILE = 'license.enc';
const PUBLIC_KEY_PATH = join(__dirname, '../../resources/public.pem');

function getLicensePath(): string {
  return join(app.getPath('userData'), LICENSE_FILE);
}

function getPublicKey(): string {
  return readFileSync(PUBLIC_KEY_PATH, 'utf8');
}

export type ActivationStatus =
  | { valid: true; payload: JwtPayload }
  | { valid: false; reason: string };

export function checkActivation(): ActivationStatus {
  const licensePath = getLicensePath();

  if (!existsSync(licensePath)) {
    return { valid: false, reason: 'no-license-file' };
  }

  try {
    const machineId = getMachineId();
    const ciphertext = readFileSync(licensePath, 'utf8');
    const token = decrypt(ciphertext, machineId);
    const payload = verify(token, getPublicKey(), {
      algorithms: ['RS256'],
    }) as JwtPayload;

    if (payload.machineId !== machineId) {
      return { valid: false, reason: 'machine-id-mismatch' };
    }

    return { valid: true, payload };
  } catch (e: any) {
    return { valid: false, reason: e.message ?? 'invalid-token' };
  }
}

export function saveLicenseToken(token: string): void {
  const machineId = getMachineId();
  const licensePath = getLicensePath();
  mkdirSync(join(app.getPath('userData')), { recursive: true });
  writeFileSync(licensePath, encrypt(token, machineId), 'utf8');
}
```

- [ ] **Step 4.2: Commit**

```bash
git add apps/desktop/src/license/activation.ts
git commit -m "feat(desktop): add RSA JWT license activation and offline verification"
```

---

## Task 5: License guard (orchestrator)

**Files:**
- Create: `apps/desktop/src/license/license-guard.ts`

- [ ] **Step 5.1: Create license-guard.ts**

```typescript
// apps/desktop/src/license/license-guard.ts
import { checkActivation } from './activation';
import { checkTrial } from './trial';

export type LicenseResult =
  | { status: 'active' }
  | { status: 'trial'; daysLeft: number }
  | { status: 'expired' };

/**
 * Called on every launch. Returns the current license state.
 * - active: valid RSA-signed activation token matches this machine
 * - trial: within the 15-day trial window
 * - expired: trial ended and no valid activation
 */
export function checkLicense(): LicenseResult {
  const activation = checkActivation();
  if (activation.valid) return { status: 'active' };

  const trial = checkTrial();
  if (trial.valid) return { status: 'trial', daysLeft: trial.daysLeft };

  return { status: 'expired' };
}
```

- [ ] **Step 5.2: Commit**

```bash
git add apps/desktop/src/license/license-guard.ts
git commit -m "feat(desktop): add license guard orchestrating activation and trial checks"
```

---

## Task 6: NestJS server spawner

**Files:**
- Create: `apps/desktop/src/server/spawn.ts`

- [ ] **Step 6.1: Create spawn.ts**

```typescript
// apps/desktop/src/server/spawn.ts
import { ChildProcess, spawn } from 'child_process';
import { createServer } from 'net';
import { join } from 'path';
import { app } from 'electron';

let serverProcess: ChildProcess | null = null;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = (srv.address() as any).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function waitForHealth(port: number, retries = 40): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${port}/health`);
        if (res.ok) {
          clearInterval(interval);
          resolve();
        }
      } catch {
        if (++attempts >= retries) {
          clearInterval(interval);
          reject(new Error('NestJS server failed to start'));
        }
      }
    }, 500);
  });
}

export async function startServer(): Promise<number> {
  const port = await getFreePort();
  const userData = app.getPath('userData');

  // In packaged app, binary is in resources/. In dev, use ts-node.
  // Binary name matches electron-builder extraResources targets: api-core-{platform}-{arch}
  // e.g. api-core-darwin-arm64, api-core-win32-x64
  const binaryPath = app.isPackaged
    ? join(process.resourcesPath, `api-core-${process.platform}-${process.arch}`)
    : join(__dirname, '../../../api-core/dist/main.js');

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    DATABASE_URL: `file://${join(userData, 'database.sqlite')}`,
    FRONTEND_URL: `http://localhost:${port}`,
    UPLOADS_PATH: join(userData, 'uploads'),
    API_PUBLIC_PATH: app.isPackaged
      ? join(process.resourcesPath, 'public')
      : join(__dirname, '../../../api-core/public'),
    PRISMA_QUERY_ENGINE_LIBRARY: app.isPackaged
      ? join(process.resourcesPath, 'prisma-query-engine.node')
      : undefined,
    BETTER_SQLITE3_BINDING: app.isPackaged
      ? join(process.resourcesPath, 'better-sqlite3.node')
      : undefined,
  };

  if (app.isPackaged) {
    serverProcess = spawn(binaryPath, [], { env, detached: false });
  } else {
    serverProcess = spawn('node', [binaryPath], { env, detached: false });
  }

  serverProcess.stdout?.on('data', (d) => console.log('[server]', d.toString()));
  serverProcess.stderr?.on('data', (d) => console.error('[server]', d.toString()));

  await waitForHealth(port);
  return port;
}

export function stopServer(): void {
  serverProcess?.kill();
  serverProcess = null;
}
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/desktop/src/server/spawn.ts
git commit -m "feat(desktop): add NestJS binary spawner with health check polling"
```

---

## Task 7: System tray

**Files:**
- Create: `apps/desktop/src/tray/tray.ts`

- [ ] **Step 7.1: Create tray.ts**

```typescript
// apps/desktop/src/tray/tray.ts
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import { join } from 'path';

let trayInstance: Tray | null = null;

export function createTray(win: BrowserWindow, port: number): Tray {
  const iconPath = join(__dirname, '../../resources/icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  trayInstance = new Tray(icon);
  trayInstance.setToolTip('Restaurant POS');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open dashboard',
      click: () => {
        win.show();
        win.focus();
      },
    },
    { label: 'Server status: running ✓', enabled: false },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit(); // main.ts handles killing the server before quit
      },
    },
  ]);

  trayInstance.setContextMenu(contextMenu);
  trayInstance.on('double-click', () => win.show());

  return trayInstance;
}
```

- [ ] **Step 7.2: Commit**

```bash
git add apps/desktop/src/tray/tray.ts
git commit -m "feat(desktop): add system tray with open/quit controls"
```

---

## Task 7b: Create activation screen (`resources/activate.html`)

**Files:**
- Create: `apps/desktop/resources/activate.html`

This is a static HTML page shown when the trial expires. It lets the user enter their license key and calls the license server to activate.

- [ ] **Step 7b.1: Create activate.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Activate Restaurant POS</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: white; border-radius: 12px; padding: 2rem; width: 380px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: #1e293b; }
    p { font-size: 0.875rem; color: #64748b; margin: 0 0 1.5rem; }
    input { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.875rem; box-sizing: border-box; font-family: monospace; letter-spacing: 0.05em; }
    button { width: 100%; margin-top: 1rem; padding: 0.625rem; background: #4f46e5; color: white; border: none; border-radius: 8px; font-size: 0.875rem; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #error { color: #dc2626; font-size: 0.8rem; margin-top: 0.5rem; display: none; }
    #success { color: #16a34a; font-size: 0.8rem; margin-top: 0.5rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Activate your license</h1>
    <p>Your trial has expired. Enter your license key to continue using Restaurant POS.</p>
    <input id="key" type="text" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19" />
    <div id="error"></div>
    <div id="success"></div>
    <button id="btn">Activate</button>
  </div>
  <script>
    const LICENSE_SERVER_URL = 'https://YOUR-RAILWAY-URL'; // replaced at build time

    document.getElementById('key').addEventListener('input', (e) => {
      // Auto-format as XXXX-XXXX-XXXX-XXXX
      let v = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      e.target.value = v.match(/.{1,4}/g)?.join('-').slice(0, 19) ?? v;
    });

    document.getElementById('btn').addEventListener('click', async () => {
      const key = document.getElementById('key').value.trim();
      const btn = document.getElementById('btn');
      const err = document.getElementById('error');
      const ok = document.getElementById('success');

      btn.disabled = true;
      err.style.display = 'none';

      try {
        // Send machine ID from main process via IPC (injected by preload)
        const machineId = window.__machineId ?? 'unknown';
        const platform = navigator.platform.includes('Win') ? 'win32' : 'darwin';

        const res = await fetch(`${LICENSE_SERVER_URL}/licenses/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: key, machineId, platform }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Activation failed');

        // Save token via IPC to main process
        window.__saveToken?.(data.token);
        ok.textContent = 'Activation successful! Restarting…';
        ok.style.display = 'block';
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
        err.textContent = e.message;
        err.style.display = 'block';
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>
```

Note: `window.__machineId` and `window.__saveToken` are injected via the preload script (update `preload.ts` in Task 8 to expose these via `contextBridge`).

- [ ] **Step 7b.2: Update preload.ts to expose machine ID and token save**

```typescript
// apps/desktop/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__machineId', process.env.MACHINE_ID ?? '');
contextBridge.exposeInMainWorld('__saveToken', (token: string) => {
  ipcRenderer.send('save-license-token', token);
});
```

Add the IPC handler in `main.ts` (before `main()` call):
```typescript
import { ipcMain } from 'electron';
import { saveLicenseToken } from './license/activation';

ipcMain.on('save-license-token', (_event, token: string) => {
  saveLicenseToken(token);
  app.relaunch();
  app.exit();
});
```

And pass the machine ID to the BrowserWindow env when creating the activation window (in `showActivationWindow`):
```typescript
// In showActivationWindow(), set MACHINE_ID env before creating the window
process.env.MACHINE_ID = getMachineId();
```

- [ ] **Step 7b.3: Commit**

```bash
git add apps/desktop/resources/activate.html apps/desktop/src/preload.ts
git commit -m "feat(desktop): add activation screen HTML and preload IPC bridge"
```

---

## Task 8: Main process

**Files:**
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/preload.ts`

- [ ] **Step 8.1: Create preload.ts (minimal)**

```typescript
// apps/desktop/src/preload.ts
// Minimal preload — context isolation enabled, no exposed APIs needed
// The app is a wrapper around a localhost web server
window.addEventListener('DOMContentLoaded', () => {});
```

- [ ] **Step 8.2: Create main.ts**

```typescript
// apps/desktop/src/main.ts
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import AutoLaunch from 'auto-launch';
import { checkLicense } from './license/license-guard';
import { startServer, stopServer } from './server/spawn';
import { createTray } from './tray/tray';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;

async function createWindow(port: number): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Restaurant POS',
  });

  // Hide window instead of closing — server stays alive
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Open external links in browser, not in the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(`http://localhost:${port}`);
  return win;
}

function showActivationWindow(): void {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    title: 'Activate Restaurant POS',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  // Load bundled activation HTML (static file in resources/)
  win.loadFile(join(__dirname, '../resources/activate.html'));
}

async function main(): Promise<void> {
  await app.whenReady();

  // Register auto-launch on OS boot
  const autoLauncher = new AutoLaunch({ name: 'Restaurant POS' });
  autoLauncher.isEnabled().then((enabled) => {
    if (!enabled) autoLauncher.enable();
  });

  const license = checkLicense();

  if (license.status === 'expired') {
    showActivationWindow();
    return;
  }

  // Start NestJS server
  const port = await startServer();

  // Create main window
  mainWindow = await createWindow(port);

  // Create tray
  createTray(mainWindow, port);

  // Show trial banner if applicable
  if (license.status === 'trial') {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.executeJavaScript(
        `window.__trialDaysLeft = ${license.daysLeft}; console.log('Trial: ${license.daysLeft} days remaining')`,
      );
    });
  }

  // Check for updates silently
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  stopServer();
});

app.on('activate', () => {
  mainWindow?.show();
});

main().catch(console.error);
```

- [ ] **Step 8.3: Build and run in dev mode**

```bash
cd apps/desktop && pnpm build && pnpm dev
```

Expected: Electron window opens and loads `http://localhost:{PORT}` (NestJS dashboard). System tray icon appears. No license prompt (within trial window).

- [ ] **Step 8.4: Commit**

```bash
git add apps/desktop/src/main.ts apps/desktop/src/preload.ts
git commit -m "feat(desktop): add Electron main process with license guard, server spawn, tray, auto-launch"
```

---

## Task 9: electron-builder config and Electron Fuses

**Files:**
- Create: `apps/desktop/electron-builder.yml`

- [ ] **Step 9.1: Create electron-builder.yml**

```yaml
# apps/desktop/electron-builder.yml
appId: com.yourcompany.restaurant-pos
productName: Restaurant POS
copyright: Copyright © 2026

directories:
  output: dist-installers

files:
  - dist/**
  - resources/**
  - node_modules/**
  - package.json

extraResources:
  # Binary names match compile-binary.mjs output: api-core-node22-{platform}-{arch}
  # electron-builder runs per-platform so only the matching binary is included
  - from: "../api-core/dist-binary/api-core-node22-macos-x64"
    to: "api-core-darwin-x64"
    filter: ["**"]
  - from: "../api-core/dist-binary/api-core-node22-macos-arm64"
    to: "api-core-darwin-arm64"
    filter: ["**"]
  - from: "../api-core/dist-binary/api-core-node22-win-x64"
    to: "api-core-win32-x64"
    filter: ["**"]
  - from: "../api-core/public"
    to: "public"
  - from: "resources/public.pem"
    to: "public.pem"

mac:
  category: public.app-category.business
  icon: resources/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist
  notarize:
    teamId: "${APPLE_TEAM_ID}"

dmg:
  sign: false

win:
  icon: resources/icon.ico
  target:
    - target: nsis
      arch: [x64]

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

publish:
  provider: github
  owner: your-github-username
  repo: restaurant-pos-releases
  private: true

afterPack: scripts/after-pack.js
```

- [ ] **Step 9.2: Create Electron Fuses script (`scripts/after-pack.js`)**

This disables DevTools and remote debugging in the production binary:

```js
// apps/desktop/scripts/after-pack.js
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { flipFuses } = require('@electron/fuses');
const path = require('path');

exports.default = async function(context) {
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;

  let executablePath;
  if (process.platform === 'darwin') {
    executablePath = path.join(appOutDir, `${appName}.app`, 'Contents', 'MacOS', appName);
  } else {
    executablePath = path.join(appOutDir, `${appName}.exe`);
  }

  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  console.log('✓ Electron Fuses applied');
};
```

- [ ] **Step 9.3: Create macOS entitlements file**

```xml
<!-- apps/desktop/resources/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

- [ ] **Step 9.4: Set up code signing env vars for macOS build**

The following env vars must be set in your shell (or CI):
```bash
export APPLE_ID="your@apple.id"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
export CSC_LINK="path/to/certificate.p12"  # or use keychain
export CSC_KEY_PASSWORD="your-cert-password"
```

- [ ] **Step 9.5: Build macOS installer (requires macOS machine)**

First build the NestJS binary for macOS:
```bash
cd packages/build-tools && pnpm build:desktop
```

Then package:
```bash
cd apps/desktop && pnpm dist:mac
```

Expected: `dist-installers/Restaurant POS-1.0.0.dmg`

- [ ] **Step 9.6: Commit**

```bash
git add apps/desktop/electron-builder.yml apps/desktop/scripts/ apps/desktop/resources/entitlements.mac.plist
git commit -m "feat(desktop): add electron-builder config with Fuses and macOS notarization"
```

---

## Task 10: Wire desktop into Turborepo

**Files:**
- Modify: `turbo.json`

- [ ] **Step 10.1: Add desktop build task**

Add to `turbo.json`:
```json
"dist:desktop": {
  "dependsOn": ["build:desktop", "desktop#build"],
  "outputs": ["apps/desktop/dist-installers/**"],
  "cache": false
}
```

- [ ] **Step 10.2: Commit**

```bash
git add turbo.json
git commit -m "feat: add dist:desktop task to Turborepo pipeline"
```

---

## Verification

1. **Dev mode:** `cd apps/desktop && pnpm dev` — window opens, loads the dashboard, tray icon visible
2. **Trial:** Delete `userData/trial.enc` and OS keychain entry → relaunch → new trial starts
3. **Trial expiry test:** Manually set `firstLaunchAt` to 16 days ago → relaunch → activation screen shown, NestJS does NOT start
4. **Activation:** Use a test key from the license server → enter in activation screen → confirm `userData/license.enc` is created
5. **Offline:** Disconnect internet → relaunch → app starts normally with the saved token
6. **Anti-copy:** Copy `userData/license.enc` to a different machine → confirm `machine-id-mismatch` error
7. **Packaged build:** Build `.dmg` → install → launch → confirm auto-start registers on login
8. **Fuses:** Verify DevTools is not accessible in the production build (Cmd+Option+I / F12 should do nothing)
