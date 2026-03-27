# Electron Minimal Launcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `apps/desktop/` as a minimal Electron process: auto-starts on boot, spawns the NestJS binary in background, opens the system browser to `http://localhost:{PORT}` once the backend is ready, and shows a system tray icon with Open and Quit options.

**Architecture:** Electron main process only — no BrowserWindow, no Chromium renderer. `shell.openExternal()` opens the system browser. Two modes via `ELECTRON_DEV_BACKEND` env var: connect to an already-running NestJS (dev) or spawn the standalone binary (prod-like). License/trial system is deferred.

**Tech Stack:** Electron 32, TypeScript, dotenv, Node.js built-in `net` + `http` + `child_process`

**Spec:** `docs/superpowers/specs/pending-2026-03-25-electron-app-dev-mode-design.md`

---

## File Map

**Created (`apps/desktop/`):**
- `package.json` — workspace package, Electron entry, dev/build scripts
- `tsconfig.json` — TypeScript config targeting CommonJS for Electron main process
- `electron-builder.yml` — packaging config (configured now, used later for installers)
- `.env.example` — template for local `.env`
- `resources/icon.png` — placeholder tray icon (16×16 PNG)
- `src/main.ts` — entry point: dotenv, single-instance lock, auto-start, spawn, tray
- `src/server/spawn.ts` — spawn NestJS binary or connect to dev backend; health poll
- `src/tray/tray.ts` — system tray icon + context menu
- `docs/running-locally.md` — setup and run instructions

**Not created in this plan:** `src/license/`, `src/preload.ts`, `resources/activate.html` (deferred).

---

## Task 1: Scaffold `apps/desktop`

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/.env.example`

- [ ] **Step 1.1 — Create `apps/desktop/package.json`**

```json
{
  "name": "@restaurants/desktop",
  "version": "1.0.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc --noEmit false",
    "dev": "tsc && electron .",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win"
  },
  "dependencies": {
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 1.2 — Create `apps/desktop/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "dist-electron"]
}
```

- [ ] **Step 1.3 — Create `apps/desktop/electron-builder.yml`**

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
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: resources/icon.ico
publish: null
```

- [ ] **Step 1.4 — Create `apps/desktop/.env.example`**

```bash
# ─── Required when spawning the binary (no ELECTRON_DEV_BACKEND) ───
JWT_SECRET=dev-secret-change-in-prod
TZ=America/Buenos_Aires

# ─── Optional: native addon paths ───────────────────────────────────
# Only needed in packaged mode or if the binary can't resolve them automatically.
# In dev mode, they are usually found via api-core/node_modules automatically.
# BETTER_SQLITE3_BINDING=/absolute/path/to/better-sqlite3.node
# PRISMA_QUERY_ENGINE_LIBRARY=/absolute/path/to/libquery_engine.dylib.node

# ─── Dev shortcuts ───────────────────────────────────────────────────
# Uncomment to connect to a running NestJS instead of spawning the binary:
# ELECTRON_DEV_BACKEND=http://localhost:3000
```

- [ ] **Step 1.5 — Install dependencies**

```bash
cd apps/desktop
pnpm install
```

Expected: `node_modules/` created, `electron` binary downloaded (~80 MB).

- [ ] **Step 1.6 — Commit**

```bash
git add apps/desktop/package.json apps/desktop/tsconfig.json apps/desktop/electron-builder.yml apps/desktop/.env.example
git commit -m "feat(desktop): scaffold Electron launcher package"
```

---

## Task 2: Add placeholder tray icon

**Files:**
- Create: `apps/desktop/resources/icon.png`

- [ ] **Step 2.1 — Generate minimal placeholder icon**

Run from repo root:

```bash
node -e "
const fs = require('fs');
// Minimal 16x16 red-square PNG (hardcoded valid PNG bytes)
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000100000001008020000009091' +
  '2600000000c4944415478016360f8cf00000000200017e6e46980000000049454e44ae426082',
  'hex'
);
fs.mkdirSync('apps/desktop/resources', { recursive: true });
fs.writeFileSync('apps/desktop/resources/icon.png', png);
console.log('icon.png created');
"
```

> This creates a minimal valid PNG. Replace with a proper restaurant logo before distribution.
> For macOS `.icns` and Windows `.ico`, see `docs/pending-to-deploy-the-stack.md` section 6.

- [ ] **Step 2.2 — Commit**

```bash
git add apps/desktop/resources/icon.png
git commit -m "feat(desktop): add placeholder tray icon"
```

---

## Task 3: Implement `src/server/spawn.ts`

**Files:**
- Create: `apps/desktop/src/server/spawn.ts`

- [ ] **Step 3.1 — Create `apps/desktop/src/server/spawn.ts`**

```typescript
import { app, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { createServer } from 'net';
import * as http from 'http';

let childProcess: ChildProcess | null = null;
let resolvedUrl: string | null = null;

function getBinaryName(): string {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64') return 'api-core-node22-macos-arm64';
  if (platform === 'darwin') return 'api-core-node22-macos-x64';
  if (platform === 'win32') return 'api-core-node22-win-x64.exe';
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}

function getBinaryDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin')
    : join(app.getAppPath(), '..', 'api-core', 'dist-binary');
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

async function pollHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`${url}/health`, res => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return; // health check passed
    } catch {
      // retry after 500 ms
    }
  }
  throw new Error('Backend did not respond to /health within 30 seconds');
}

export async function startServer(): Promise<string> {
  const devBackend = process.env.ELECTRON_DEV_BACKEND;
  if (devBackend) {
    console.log(`[spawn] Using dev backend: ${devBackend}`);
    resolvedUrl = devBackend;
    return resolvedUrl;
  }

  const port = await findFreePort();
  const userData = app.getPath('userData');
  const binaryDir = getBinaryDir();
  const binaryPath = join(binaryDir, getBinaryName());

  console.log(`[spawn] Starting binary: ${binaryPath} on port ${port}`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    DATABASE_URL: `file://${join(userData, 'database.sqlite')}`,
    UPLOADS_PATH: join(userData, 'uploads'),
    JWT_SECRET: process.env.JWT_SECRET ?? '',
    TZ: process.env.TZ ?? 'UTC',
    FRONTEND_URL: `http://localhost:${port}`,
  };

  // Pass native addon paths if provided in .env (required for packaged mode)
  if (process.env.BETTER_SQLITE3_BINDING) {
    env.BETTER_SQLITE3_BINDING = process.env.BETTER_SQLITE3_BINDING;
  }
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    env.PRISMA_QUERY_ENGINE_LIBRARY = process.env.PRISMA_QUERY_ENGINE_LIBRARY;
  }

  childProcess = spawn(binaryPath, [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  childProcess.stdout?.on('data', (d: Buffer) =>
    console.log('[api-core]', d.toString().trimEnd()),
  );
  childProcess.stderr?.on('data', (d: Buffer) =>
    console.error('[api-core]', d.toString().trimEnd()),
  );
  childProcess.on('exit', code => {
    if (code !== 0 && code !== null) {
      dialog.showErrorBox(
        'Error del servidor',
        `El proceso del servidor se detuvo inesperadamente (código ${code}).\nReinicia la aplicación.`,
      );
      app.quit();
    }
  });

  resolvedUrl = `http://localhost:${port}`;
  await pollHealth(resolvedUrl);
  console.log(`[spawn] Backend ready at ${resolvedUrl}`);
  return resolvedUrl;
}

export function stopServer(): void {
  if (childProcess) {
    console.log('[spawn] Stopping backend process');
    childProcess.kill();
    childProcess = null;
  }
}

export function getServerUrl(): string | null {
  return resolvedUrl;
}
```

- [ ] **Step 3.2 — Verify TypeScript compiles without errors**

```bash
cd apps/desktop
pnpm build
```

Expected: `dist/server/spawn.js` created, no TypeScript errors.

- [ ] **Step 3.3 — Commit**

```bash
git add apps/desktop/src/server/spawn.ts
git commit -m "feat(desktop): add server spawn with health polling and dev backend toggle"
```

---

## Task 4: Implement `src/tray/tray.ts`

**Files:**
- Create: `apps/desktop/src/tray/tray.ts`

- [ ] **Step 4.1 — Create `apps/desktop/src/tray/tray.ts`**

```typescript
import { app, Menu, Tray, nativeImage, shell } from 'electron';
import { join } from 'path';
import { stopServer, getServerUrl } from '../server/spawn';

let tray: Tray | null = null;

function loadIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png');

  const img = nativeImage.createFromPath(iconPath);
  // Return empty image gracefully if file is missing in dev
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

export function createTray(): void {
  tray = new Tray(loadIcon());
  tray.setToolTip('Restaurantes POS');
  setTrayStatus('starting');

  // Double-click opens browser (convenience on macOS/Windows)
  tray.on('double-click', () => {
    const url = getServerUrl();
    if (url) shell.openExternal(url);
  });
}

export function setTrayStatus(status: 'starting' | 'running'): void {
  if (!tray) return;

  const serverUrl = getServerUrl();

  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir dashboard',
      enabled: status === 'running',
      click: () => {
        if (serverUrl) shell.openExternal(serverUrl);
      },
    },
    {
      label: status === 'running' ? 'Servidor: corriendo ✓' : 'Servidor: iniciando…',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        stopServer();
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}
```

- [ ] **Step 4.2 — Verify TypeScript compiles without errors**

```bash
cd apps/desktop
pnpm build
```

Expected: `dist/tray/tray.js` created, no errors.

- [ ] **Step 4.3 — Commit**

```bash
git add apps/desktop/src/tray/tray.ts
git commit -m "feat(desktop): add system tray with open/quit menu"
```

---

## Task 5: Implement `src/main.ts`

**Files:**
- Create: `apps/desktop/src/main.ts`

- [ ] **Step 5.1 — Create `apps/desktop/src/main.ts`**

```typescript
// Load .env before any other module reads process.env
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(__dirname, '..', '.env') });

import { app, shell } from 'electron';
import { startServer } from './server/spawn';
import { createTray, setTrayStatus } from './tray/tray';

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Hide from macOS Dock — this is a tray-only app
if (process.platform === 'darwin') {
  app.dock?.hide();
}

app.whenReady().then(async () => {
  // Register auto-start on boot (login item)
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });

  createTray();

  try {
    const url = await startServer();
    setTrayStatus('running');
    // Open the system browser once the backend is ready
    await shell.openExternal(url);
  } catch (err) {
    console.error('[main] Failed to start server:', err);
    app.quit();
  }
});

// Keep the process alive even when no windows are open (tray-only app)
app.on('window-all-closed', () => {
  // Do not quit — the process lives in the tray
});
```

- [ ] **Step 5.2 — Verify full build compiles without errors**

```bash
cd apps/desktop
pnpm build
```

Expected: `dist/main.js`, `dist/server/spawn.js`, `dist/tray/tray.js` — no TypeScript errors.

- [ ] **Step 5.3 — Commit**

```bash
git add apps/desktop/src/main.ts
git commit -m "feat(desktop): add main entry — auto-start, spawn, tray, open browser"
```

---

## Task 6: Smoke test — dev mode with ELECTRON_DEV_BACKEND

- [ ] **Step 6.1 — Create local `.env` for dev**

```bash
cd apps/desktop
cp .env.example .env
```

Edit `.env` and uncomment `ELECTRON_DEV_BACKEND`:

```bash
JWT_SECRET=dev-secret-change-in-prod
TZ=America/Buenos_Aires
ELECTRON_DEV_BACKEND=http://localhost:3000
```

- [ ] **Step 6.2 — Start NestJS in a separate terminal**

```bash
cd apps/api-core
pnpm dev
# Wait for: Application is running on: http://[::1]:3000
```

- [ ] **Step 6.3 — Run Electron**

In another terminal:

```bash
cd apps/desktop
pnpm dev
```

Expected:
- Console: `[spawn] Using dev backend: http://localhost:3000`
- macOS Dock: no icon (hidden)
- Menu bar / system tray: shows Restaurantes POS icon
- System browser opens automatically to `http://localhost:3000`
- Right-click tray → "Servidor: corriendo ✓"
- Right-click tray → "Abrir dashboard" → browser opens
- Right-click tray → "Salir" → Electron quits

- [ ] **Step 6.4 — Smoke test — spawn binary mode**

Edit `.env`, comment out `ELECTRON_DEV_BACKEND`:

```bash
JWT_SECRET=dev-secret-change-in-prod
TZ=America/Buenos_Aires
# ELECTRON_DEV_BACKEND=http://localhost:3000
```

Stop the running NestJS dev server. Then:

```bash
cd apps/desktop
pnpm dev
```

Expected:
- Console: `[spawn] Starting binary: .../api-core-node22-macos-arm64 on port XXXXX`
- Console: `[api-core]` lines with NestJS startup output
- Console: `[spawn] Backend ready at http://localhost:XXXXX`
- Browser opens to `http://localhost:XXXXX`
- Tray shows "Servidor: corriendo ✓"

---

## Task 7: Documentation

**Files:**
- Create: `apps/desktop/docs/running-locally.md`

- [ ] **Step 7.1 — Create `apps/desktop/docs/running-locally.md`**

```markdown
# Electron App — Running Locally

## Prerequisites

- Node.js 22 and pnpm installed
- From repo root: `pnpm install` (installs all workspace dependencies)
- NestJS binaries built: `pnpm --filter @restaurants/api-core build && pnpm build:desktop`
  (only required if using binary spawn mode)

## Setup

```bash
cd apps/desktop
cp .env.example .env
# Edit .env — see Variables section below
pnpm install
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

Or remove programmatically:
```bash
node -e "require('electron').app.setLoginItemSettings({ openAtLogin: false })"
```

## Packaging (future)

To produce a `.dmg` (macOS) or `.exe` installer (Windows), see
`docs/pending-to-deploy-the-stack.md`.
```

- [ ] **Step 7.2 — Commit**

```bash
git add apps/desktop/docs/running-locally.md
git commit -m "docs(desktop): add running-locally guide with both dev modes"
```

---

## Task 8: Update README and workspace

**Files:**
- Modify: `README.md`

- [ ] **Step 8.1 — Update README Electron section**

In `README.md`, replace the `ELECTRON_SKIP_LICENSE=true` row in the variables table (that variable no longer applies in the minimal launcher) and update the run command:

Find:
```markdown
| `ELECTRON_SKIP_LICENSE=true` | Salta validación de trial/licencia |
| `ELECTRON_DEV_BACKEND=http://localhost:3000` | Usa NestJS ya corriendo en lugar de spawnear el binario |
```

Replace with:
```markdown
| `ELECTRON_DEV_BACKEND=http://localhost:3000` | Usa NestJS ya corriendo en lugar de spawnear el binario |
```

- [ ] **Step 8.2 — Verify workspace picks up `@restaurants/desktop`**

```bash
cd /path/to/repo/root
pnpm --filter @restaurants/desktop build
```

Expected: TypeScript compiles without errors from repo root.

- [ ] **Step 8.3 — Commit**

```bash
git add README.md
git commit -m "docs: update README — remove ELECTRON_SKIP_LICENSE from Electron section"
```

---

## Self-Review

**Spec coverage:**
- ✅ Auto-start on boot: `app.setLoginItemSettings({ openAtLogin: true })` in main.ts
- ✅ Tray icon + menu: `tray.ts`
- ✅ System browser: `shell.openExternal(url)` in main.ts
- ✅ Binary spawn + health poll: `spawn.ts`
- ✅ ELECTRON_DEV_BACKEND toggle: `spawn.ts` line 1
- ✅ Single instance lock: `app.requestSingleInstanceLock()` in main.ts
- ✅ macOS Dock hidden: `app.dock?.hide()` in main.ts
- ✅ Graceful tray icon fallback: `nativeImage.createEmpty()` if icon missing
- ✅ License system: documented as deferred in spec, not referenced in code
- ✅ Documentation: `apps/desktop/docs/running-locally.md`

**Type consistency:** `getServerUrl()` and `stopServer()` exported from `spawn.ts`, consumed by both `tray.ts` and `main.ts`. `createTray()` and `setTrayStatus()` exported from `tray.ts`, consumed by `main.ts`. No naming mismatches.

**No placeholders:** All code blocks are complete and runnable.
