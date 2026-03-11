# Desktop Distribution & Licensing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empaquetar el monorepo NestJS + Astro como un binario de escritorio Electron con sistema de licencias por máquina (trial 15 días → activación online única → validación RSA offline).

**Architecture:** Electron shell (`apps/desktop/`) arranca NestJS como proceso hijo y sirve el dashboard Astro como archivos estáticos via `ServeStaticModule`. La validación de licencias ocurre antes de arrancar NestJS: trial encriptado en disco + token RSA firmado por un License Server separado deployado en Railway. Protección de código via bytenode (bytecode V8) + Electron Fuses.

**Tech Stack:** Electron 32, electron-builder 25, electron-updater 6, @electron/fuses, bytenode, javascript-obfuscator, node-machine-id, NestJS (existente), Astro static, better-sqlite3 (existente).

**Spec:** `docs/superpowers/specs/2026-03-10-desktop-distribution-design.md`

---

## Chunk 1: Astro Static Output + NestJS ServeStatic

### Task 1: Migrar ui-dashboard a output estático

**Files:**
- Modify: `apps/ui-dashboard/astro.config.mjs`
- Modify: `apps/api-core/src/app.module.ts`
- Modify: `apps/api-core/package.json` (agregar `@nestjs/serve-static` si no existe)

**Contexto:** Astro usa actualmente `output: 'server'` con el adaptador node. Como todo el auth va por JWT hacia NestJS (ninguna página usa sesiones de Astro), se puede compilar a HTML/JS/CSS estático. NestJS ya tiene `ServeStaticModule` instalado y usado para `/uploads`.

- [ ] **Step 1: Verificar que @nestjs/serve-static ya está instalado**

```bash
grep "serve-static" apps/api-core/package.json
```

Esperado: `"@nestjs/serve-static": "..."` en dependencies. Si no aparece, instalar:

```bash
pnpm --filter api-core add @nestjs/serve-static
```

- [ ] **Step 2: Cambiar Astro a static output**

Editar `apps/ui-dashboard/astro.config.mjs`:

```js
// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [tailwind()],
});
```

Eliminar el import de `node` y la línea `adapter: node(...)`. El adaptador `@astrojs/node` puede quedar en package.json por ahora (no causa daño si no se usa en config).

- [ ] **Step 3: Verificar que el build estático funciona**

```bash
pnpm --filter @restaurants/ui-dashboard build
```

Esperado: genera `apps/ui-dashboard/dist/` con archivos `.html`, `.js`, `.css`. Sin errores. Si hay páginas que usaban `Astro.request` o `Astro.locals` del servidor, el build fallará y habrá que migrar esas páginas a fetch client-side.

- [ ] **Step 4: Agregar ServeStatic para el dashboard en NestJS**

Editar `apps/api-core/src/app.module.ts`. El módulo ya importa `ServeStaticModule` para `/uploads`. Agregar una segunda entrada para servir el dashboard. El path del dashboard se lee desde la variable de entorno `DASHBOARD_PATH` (pasada por Electron en producción) con fallback al path relativo para desarrollo:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
// ... resto de imports existentes

function getDashboardPath(): string {
  // En Electron production, server-manager.ts pasa DASHBOARD_PATH
  if (process.env.DASHBOARD_PATH) return process.env.DASHBOARD_PATH;
  // En desarrollo local (pnpm dev)
  return join(process.cwd(), '..', 'ui-dashboard', 'dist');
}

function getUploadPath(): string {
  if (process.env.UPLOAD_PATH) return process.env.UPLOAD_PATH;
  return join(process.cwd(), 'uploads');
}

@Module({
  imports: [
    ConfigModule.forRoot(),
    ServeStaticModule.forRoot(
      {
        rootPath: getUploadPath(),
        serveRoot: '/uploads',
      },
      {
        // Sirve el dashboard Astro estático en la raíz
        rootPath: getDashboardPath(),
        exclude: ['/api*', '/uploads*'],
      },
    ),
    // ... resto de módulos existentes sin cambios
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Verificar que NestJS sirve el dashboard**

```bash
# Terminal 1: build dashboard primero
pnpm --filter @restaurants/ui-dashboard build

# Terminal 2: arrancar NestJS
pnpm --filter api-core dev
```

Abrir `http://localhost:3000` en el browser. Esperado: se ve el dashboard de Astro. Las rutas de API siguen funcionando en `http://localhost:3000/api/v1/...`.

- [ ] **Step 6: Commit**

```bash
git add apps/ui-dashboard/astro.config.mjs apps/api-core/src/app.module.ts
git commit -m "feat(desktop): migrate dashboard to static output, serve via NestJS ServeStaticModule"
```

---

## Chunk 2: Electron Shell — Arrancar NestJS y Abrir Ventana

### Task 2: Crear el paquete apps/desktop

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/src/server-manager.ts`

**Contexto:** El Electron main process es Node.js. Arrancará NestJS como proceso hijo (`child_process.fork`) pasándole las variables de entorno necesarias (DATABASE_URL apuntando a userData, JWT_SECRET auto-generado en primer arranque). El path al main de NestJS varía entre dev y production (packaged).

- [ ] **Step 1: Crear package.json del paquete desktop**

Crear `apps/desktop/package.json`:

```json
{
  "name": "@restaurants/desktop",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "dev": "tsc && electron .",
    "build": "tsc",
    "pack": "electron-builder --dir",
    "dist:win": "electron-builder --win",
    "dist:mac": "electron-builder --mac",
    "postinstall": "electron-rebuild"
  },
  "dependencies": {
    "node-machine-id": "^1.1.12"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "electron-updater": "^6.0.0",
    "@electron/fuses": "^1.8.0",
    "bytenode": "^1.5.0",
    "javascript-obfuscator": "^4.1.0",
    "electron-rebuild": "^3.2.9",
    "typescript": "^5.7.3",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Crear tsconfig.json para Electron**

Crear `apps/desktop/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Instalar dependencias del paquete desktop**

```bash
pnpm --filter @restaurants/desktop install
```

Esperado: instala electron, electron-builder, node-machine-id, etc. `electron-rebuild` se ejecuta automáticamente via `postinstall` y recompila `better-sqlite3` para la versión Node de Electron.

- [ ] **Step 4: Crear server-manager.ts — gestión del proceso NestJS**

Crear `apps/desktop/src/server-manager.ts`:

```typescript
import { ChildProcess, fork } from 'child_process';
import { app } from 'electron';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const isDev = !app.isPackaged;

function getNestJsMainPath(): string {
  if (isDev) {
    // En desarrollo: apunta al dist de api-core relativo al workspace
    return path.join(__dirname, '..', '..', 'api-core', 'dist', 'main.js');
  }
  // En producción: api-core está en resources/api-core/dist/
  return path.join(process.resourcesPath, 'api-core', 'dist', 'main.jsc');
}

function getDashboardPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'ui-dashboard', 'dist');
  }
  return path.join(process.resourcesPath, 'ui-dashboard', 'dist');
}

function getOrCreateJwtSecret(): string {
  const secretPath = path.join(app.getPath('userData'), 'jwt.secret');
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trim();
  }
  const secret = crypto.randomBytes(64).toString('hex');
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

let nestProcess: ChildProcess | null = null;

export function startNestServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const nestMain = getNestJsMainPath();
    const dbPath = path.join(app.getPath('userData'), 'restaurant.db');
    const uploadPath = path.join(app.getPath('userData'), 'uploads');
    const dashboardPath = getDashboardPath();

    fs.mkdirSync(uploadPath, { recursive: true });

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: `file:${dbPath}`,
      JWT_SECRET: getOrCreateJwtSecret(),
      FRONTEND_URL: 'http://localhost:3000',
      DASHBOARD_PATH: dashboardPath,
      UPLOAD_PATH: uploadPath,
    };

    nestProcess = fork(nestMain, [], {
      env,
      silent: false, // logs visibles en consola de Electron en dev
    });

    nestProcess.on('message', (msg: unknown) => {
      if ((msg as { ready?: boolean })?.ready) resolve();
    });

    // Timeout: si NestJS no señala ready en 15s, resolver igual
    const timeout = setTimeout(() => resolve(), 15_000);

    nestProcess.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`NestJS exited with code ${code}`));
    });

    nestProcess.once('spawn', () => {
      // Fallback: esperar 5s si NestJS no emite 'ready'
      setTimeout(resolve, 5_000);
    });
  });
}

export function stopNestServer(): void {
  if (nestProcess && !nestProcess.killed) {
    nestProcess.kill('SIGTERM');
    nestProcess = null;
  }
}
```

- [ ] **Step 5: Crear main.ts — Electron main process**

Crear `apps/desktop/src/main.ts`:

```typescript
import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron';
import path from 'path';
import { startNestServer, stopNestServer } from './server-manager';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Restaurant POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // mostrar sólo cuando cargue
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // En dev, abrir DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'resources', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Abrir en navegador',
      click: () => shell.openExternal('http://localhost:3000'),
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        stopNestServer();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Restaurant POS');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

async function bootstrap(): Promise<void> {
  // Evitar múltiples instancias
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  await app.whenReady();

  // Arrancar NestJS antes de abrir la ventana
  await startNestServer();

  createTray();
  createWindow();

  // Inicio automático con el sistema operativo
  if (!isDev) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', () => {
    stopNestServer();
  });
}

app.on('window-all-closed', () => {
  // En macOS, mantener la app corriendo (sólo en tray)
  if (process.platform !== 'darwin') {
    // En Windows, también mantener en tray — no cerrar al cerrar ventana
    // app.quit(); // comentado intencionalmente
  }
});

bootstrap().catch(console.error);
```

- [ ] **Step 6: Crear preload.ts**

Crear `apps/desktop/src/preload.ts`:

```typescript
// El preload expone APIs seguras al renderer si se necesitan en el futuro.
// Por ahora, el dashboard Astro es estático y sólo habla con NestJS via HTTP.
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
```

- [ ] **Step 7: Crear íconos placeholder**

```bash
mkdir -p apps/desktop/resources

# Crear tray-icon.png (16x16) y icon.png (512x512) como placeholders
python3 -c "
import struct, zlib

def png(w, h, color):
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += color
    compressed = zlib.compress(raw)
    data = b'\x89PNG\r\n\x1a\n'
    data += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', compressed)
    data += chunk(b'IEND', b'')
    return data

open('apps/desktop/resources/tray-icon.png', 'wb').write(png(16, 16, b'\x1a\x1a\x2e\xff'))
open('apps/desktop/resources/icon.png', 'wb').write(png(512, 512, b'\x1a\x1a\x2e\xff'))
print('created tray-icon.png and icon.png')
"

# Convertir icon.png a icon.ico (Windows) usando Python
python3 -c "
# ico = PNG repackaged como ICO (single 256x256 frame)
import struct, zlib

def make_png(w, h):
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += b'\x1a\x1a\x2e\xff'
    compressed = zlib.compress(raw)
    data = b'\x89PNG\r\n\x1a\n'
    data += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', compressed)
    data += chunk(b'IEND', b'')
    return data

png_data = make_png(256, 256)
# ICO header + directory entry + PNG data
ico = struct.pack('<HHH', 0, 1, 1)  # reserved, type=1 (ICO), count=1
ico += struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png_data), 22)
ico += png_data
open('apps/desktop/resources/icon.ico', 'wb').write(ico)
print('created icon.ico')
"

# macOS icns: usar el PNG directamente (electron-builder acepta PNG para desarrollo)
cp apps/desktop/resources/icon.png apps/desktop/resources/icon.icns
echo 'copied icon.png as icon.icns placeholder (reemplazar con icns real antes de distribuir)'
```

**Nota:** Estos son íconos placeholder. Antes de distribuir, reemplazar con diseños reales usando `electron-icon-builder` o `iconutil` (macOS).

- [ ] **Step 8: Compilar y probar en dev**

```bash
# Terminal 1: build NestJS y dashboard primero
pnpm --filter api-core build
pnpm --filter @restaurants/ui-dashboard build

# Terminal 2: compilar y arrancar Electron
pnpm --filter @restaurants/desktop build
pnpm --filter @restaurants/desktop dev
```

Esperado: se abre una ventana de Electron mostrando el dashboard en `http://localhost:3000`. El ícono de tray aparece en la barra del sistema. NestJS corre en background.

- [ ] **Step 9: Agregar desktop a turbo.json**

Editar `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "pack": {
      "dependsOn": ["build"],
      "cache": false
    }
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/ turbo.json
git commit -m "feat(desktop): Electron shell — spawns NestJS, opens dashboard window, tray icon"
```

---

## Chunk 3: License Guard — Trial y Activación RSA

### Task 3: Implementar machine-id y encriptación de licencia

**Files:**
- Create: `apps/desktop/src/license/machine-id.ts`
- Create: `apps/desktop/src/license/crypto.ts`
- Create: `apps/desktop/src/license/trial.ts`
- Create: `apps/desktop/src/license/activation.ts`
- Create: `apps/desktop/src/license/license-guard.ts`
- Create: `apps/desktop/src/license/activation-window.ts`
- Modify: `apps/desktop/src/main.ts`

**Contexto:** La validación de licencia ocurre en el Electron main process ANTES de arrancar NestJS. Si falla (trial expirado o no activado), se muestra una ventana de activación en lugar del dashboard. El token RSA usa la clave pública embebida en el binario para verificar tokens generados por el License Server.

- [ ] **Step 1: Crear machine-id.ts**

Crear `apps/desktop/src/license/machine-id.ts`:

```typescript
import { machineIdSync } from 'node-machine-id';

/**
 * Devuelve un ID único de la máquina basado en el UUID del hardware del OS.
 * Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
 * macOS: IOPlatformSerialNumber
 * Estable entre reinicios; cambia si se reinstala el OS.
 */
export function getMachineId(): string {
  try {
    return machineIdSync(true); // true = hash SHA-256 del ID raw
  } catch {
    // Fallback: no debería ocurrir en uso normal
    throw new Error('No se pudo obtener el ID de la máquina');
  }
}
```

- [ ] **Step 2: Crear crypto.ts — encriptación AES del archivo de licencia**

Crear `apps/desktop/src/license/crypto.ts`:

```typescript
import crypto from 'crypto';

// Clave AES-256 derivada de una semilla fija + machineId.
// Hardcodear la semilla en el binario; el machineId la personaliza por máquina.
const SEED = 'restaurant-pos-v1-2026'; // cambiar en producción

function deriveKey(machineId: string): Buffer {
  return crypto.scryptSync(SEED + machineId, 'restaurant-salt', 32);
}

export function encrypt(data: object, machineId: string): string {
  const key = deriveKey(machineId);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(ciphertext: string, machineId: string): object {
  const [ivHex, dataHex] = ciphertext.split(':');
  const key = deriveKey(machineId);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}
```

- [ ] **Step 3: Escribir tests para crypto.ts**

Crear `apps/desktop/src/license/crypto.spec.ts`:

```typescript
import { encrypt, decrypt } from './crypto';

describe('crypto', () => {
  const machineId = 'test-machine-id-abc123';
  const data = { firstLaunchAt: '2026-01-01T00:00:00.000Z', machineId };

  it('encrypts and decrypts data correctly', () => {
    const ciphertext = encrypt(data, machineId);
    expect(ciphertext).not.toEqual(JSON.stringify(data));

    const result = decrypt(ciphertext, machineId);
    expect(result).toEqual(data);
  });

  it('fails to decrypt with a different machineId', () => {
    const ciphertext = encrypt(data, machineId);
    expect(() => decrypt(ciphertext, 'other-machine-id')).toThrow();
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const c1 = encrypt(data, machineId);
    const c2 = encrypt(data, machineId);
    expect(c1).not.toEqual(c2);
  });
});
```

Ejecutar:
```bash
cd apps/desktop && npx jest src/license/crypto.spec.ts
```
Esperado: FAIL (crypto.ts existe pero jest no está configurado aún — ver step 4).

- [ ] **Step 4: Configurar jest en apps/desktop**

Agregar a `apps/desktop/package.json`:

```json
{
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/*.spec.ts"]
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

```bash
pnpm --filter @restaurants/desktop add -D jest ts-jest @types/jest
cd apps/desktop && npx jest src/license/crypto.spec.ts
```

Esperado: PASS (3 tests).

- [ ] **Step 5: Crear trial.ts**

Crear `apps/desktop/src/license/trial.ts`:

```typescript
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getMachineId } from './machine-id';
import { encrypt, decrypt } from './crypto';

const TRIAL_DAYS = 15;

interface LicenseFile {
  firstLaunchAt: string;
  machineId: string;
  activationToken?: string; // presente si está activado
}

function getLicensePath(): string {
  return path.join(app.getPath('userData'), 'license.enc');
}

function readLicenseFile(machineId: string): LicenseFile | null {
  const licensePath = getLicensePath();
  if (!fs.existsSync(licensePath)) return null;
  try {
    const ciphertext = fs.readFileSync(licensePath, 'utf-8');
    return decrypt(ciphertext, machineId) as LicenseFile;
  } catch {
    return null; // archivo corrupto o manipulado
  }
}

function writeLicenseFile(data: LicenseFile, machineId: string): void {
  const licensePath = getLicensePath();
  fs.mkdirSync(path.dirname(licensePath), { recursive: true });
  fs.writeFileSync(licensePath, encrypt(data, machineId), { mode: 0o600 });
}

export type LicenseStatus =
  | { status: 'active'; machineId: string }
  | { status: 'trial'; daysRemaining: number; machineId: string }
  | { status: 'expired'; machineId: string }
  | { status: 'invalid'; reason: string };

export function checkLicense(): LicenseStatus {
  const machineId = getMachineId();
  const licenseData = readLicenseFile(machineId);

  // Primera instalación
  if (!licenseData) {
    const newLicense: LicenseFile = {
      firstLaunchAt: new Date().toISOString(),
      machineId,
    };
    writeLicenseFile(newLicense, machineId);
    return { status: 'trial', daysRemaining: TRIAL_DAYS, machineId };
  }

  // Verificar que el machineId coincide (anti-copia del archivo)
  if (licenseData.machineId !== machineId) {
    return { status: 'invalid', reason: 'License file belongs to a different machine' };
  }

  // Ya activado con token RSA
  if (licenseData.activationToken) {
    return { status: 'active', machineId };
    // La verificación RSA del token se hace en activation.ts
  }

  // Calcular días de trial
  const firstLaunch = new Date(licenseData.firstLaunchAt).getTime();
  const now = Date.now();
  const daysElapsed = Math.floor((now - firstLaunch) / (1000 * 60 * 60 * 24));
  const daysRemaining = TRIAL_DAYS - daysElapsed;

  if (daysRemaining > 0) {
    return { status: 'trial', daysRemaining, machineId };
  }

  return { status: 'expired', machineId };
}

export function saveActivationToken(token: string): void {
  const machineId = getMachineId();
  const existing = readLicenseFile(machineId);
  if (!existing) throw new Error('No license file found to update');
  writeLicenseFile({ ...existing, activationToken: token }, machineId);
}

export function getActivationToken(): string | null {
  const machineId = getMachineId();
  const data = readLicenseFile(machineId);
  return data?.activationToken ?? null;
}
```

- [ ] **Step 6: Escribir tests para trial.ts**

Crear `apps/desktop/src/license/trial.spec.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock electron app.getPath
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue(fs.mkdtempSync(path.join(os.tmpdir(), 'trial-test-'))),
  },
}));

// Mock machine-id para test determinista
jest.mock('./machine-id', () => ({
  getMachineId: jest.fn().mockReturnValue('test-machine-abc'),
}));

import { checkLicense, saveActivationToken } from './trial';

describe('trial', () => {
  beforeEach(() => {
    // Limpiar el directorio userData entre tests
    const { app } = require('electron');
    const licensePath = path.join(app.getPath('userData'), 'license.enc');
    if (fs.existsSync(licensePath)) fs.unlinkSync(licensePath);
  });

  it('returns trial with 15 days on first launch', () => {
    const result = checkLicense();
    expect(result.status).toBe('trial');
    if (result.status === 'trial') {
      expect(result.daysRemaining).toBe(15);
    }
  });

  it('returns trial on second call (reads existing file)', () => {
    checkLicense(); // creates file
    const result = checkLicense();
    expect(result.status).toBe('trial');
  });

  it('returns active after saving activation token', () => {
    checkLicense(); // creates file
    saveActivationToken('fake-rsa-token');
    const result = checkLicense();
    expect(result.status).toBe('active');
  });
});
```

```bash
cd apps/desktop && npx jest src/license/trial.spec.ts
```

Esperado: PASS (3 tests).

- [ ] **Step 7: Crear activation.ts — verificación RSA y POST al servidor**

Crear `apps/desktop/src/license/activation.ts`:

```typescript
import crypto from 'crypto';
import https from 'https';
import { saveActivationToken, getActivationToken } from './trial';
import { getMachineId } from './machine-id';

// Clave pública RSA — se carga desde el archivo license.pub en resources/.
// En Chunk 5 (Task 6 Step 1) se copia la clave pública real generada por el License Server.
// Durante desarrollo local (Chunks 3-4), verifyLocalToken() siempre retornará false
// hasta que se instale la clave real; esto es esperado: la pantalla de activación aparece
// pero el flujo de trial funciona correctamente.
function getPublicKeyPath(): string {
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', '..', 'resources');
  return path.join(resourcesPath, 'license.pub');
}

function getPublicKey(): string | null {
  const keyPath = getPublicKeyPath();
  if (!fs.existsSync(keyPath)) return null;
  return fs.readFileSync(keyPath, 'utf-8');
}

const LICENSE_SERVER_URL = 'https://licenses.tu-dominio.com';

export interface ActivationResult {
  success: boolean;
  error?: string;
}

/**
 * Verifica el token RSA guardado localmente.
 * Retorna false si el token es inválido o el machineId no coincide.
 */
export function verifyLocalToken(): boolean {
  const token = getActivationToken();
  if (!token) return false;

  const publicKey = getPublicKey();
  if (!publicKey) return false; // sin clave pública, no se puede verificar

  try {
    // El token es: base64(signature) + '.' + base64(payload)
    const [signatureB64, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    const signature = Buffer.from(signatureB64, 'base64');

    // Verificar firma RSA-SHA256
    const verify = crypto.createVerify('SHA256');
    verify.update(payloadB64);
    const valid = verify.verify(publicKey, signature);

    if (!valid) return false;

    // Verificar que el machineId del token coincide con esta máquina
    return payload.machineId === getMachineId();
  } catch {
    return false;
  }
}

/**
 * Activa la licencia contactando el servidor de licencias.
 * Solo se llama una vez; el token queda guardado localmente.
 */
export async function activateLicense(licenseKey: string): Promise<ActivationResult> {
  const machineId = getMachineId();

  return new Promise((resolve) => {
    const body = JSON.stringify({
      licenseKey,
      machineId,
      platform: process.platform,
    });

    const url = new URL(`${LICENSE_SERVER_URL}/license/activate`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const { token } = JSON.parse(data);
              saveActivationToken(token);
              resolve({ success: true });
            } catch {
              resolve({ success: false, error: 'Respuesta inválida del servidor' });
            }
          } else {
            try {
              const { message } = JSON.parse(data);
              resolve({ success: false, error: message || `Error ${res.statusCode}` });
            } catch {
              resolve({ success: false, error: `Error ${res.statusCode}` });
            }
          }
        });
      },
    );

    req.on('error', (err) => {
      resolve({ success: false, error: `Sin conexión: ${err.message}` });
    });

    req.setTimeout(10_000, () => {
      req.destroy();
      resolve({ success: false, error: 'Tiempo de espera agotado' });
    });

    req.write(body);
    req.end();
  });
}
```

- [ ] **Step 8: Crear activation-window.ts — ventana de activación**

Crear `apps/desktop/src/license/activation-window.ts`:

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { activateLicense } from './activation';
import { getMachineId } from './machine-id';

export function createActivationWindow(): Promise<void> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 420,
      resizable: false,
      title: 'Activar Restaurant POS',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // HTML inline para la pantalla de activación
    const machineId = getMachineId().substring(0, 16) + '...';
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; flex-direction: column; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    h2 { color: #38bdf8; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 13px; text-align: center; max-width: 320px; }
    .machine-id { font-family: monospace; font-size: 11px; color: #64748b;
                  background: #1e293b; padding: 8px; border-radius: 4px; margin: 12px 0; }
    input { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #334155;
            background: #1e293b; color: #e2e8f0; font-size: 15px; letter-spacing: 2px;
            text-align: center; box-sizing: border-box; margin-bottom: 12px; }
    button { width: 100%; padding: 12px; border-radius: 6px; background: #0ea5e9;
             color: white; border: none; font-size: 15px; cursor: pointer; font-weight: bold; }
    button:disabled { opacity: 0.5; cursor: default; }
    .error { color: #f87171; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <h2>Activar Licencia</h2>
  <p>Ingresa tu clave de licencia para continuar usando Restaurant POS</p>
  <div class="machine-id">Machine ID: ${machineId}</div>
  <input id="key" type="text" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19">
  <button id="btn" onclick="activate()">Activar</button>
  <div class="error" id="error"></div>
  <script>
    async function activate() {
      const key = document.getElementById('key').value.trim();
      const btn = document.getElementById('btn');
      const err = document.getElementById('error');
      if (!key) return;
      btn.disabled = true;
      btn.textContent = 'Activando...';
      err.textContent = '';
      const result = await window.electronAPI.activateLicense(key);
      if (result.success) {
        btn.textContent = '¡Activado! Reiniciando...';
        window.electronAPI.restart();
      } else {
        err.textContent = result.error || 'Error desconocido';
        btn.disabled = false;
        btn.textContent = 'Activar';
      }
    }
  </script>
</body>
</html>`;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // IPC: la ventana llama a activateLicense y a restart
    ipcMain.handle('activate-license', async (_event, key: string) => {
      return activateLicense(key);
    });

    let activationSucceeded = false;

    ipcMain.handle('restart-app', () => {
      activationSucceeded = true;
      win.destroy(); // destroy() no emite 'closed'
      resolve();
    });

    win.on('closed', () => {
      // Solo salir si el usuario cerró la ventana manualmente (no por activación exitosa)
      if (!activationSucceeded) {
        process.exit(0);
      }
    });
  });
}
```

- [ ] **Step 9: Actualizar preload.ts para exponer IPC de licencia**

Editar `apps/desktop/src/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  activateLicense: (key: string) => ipcRenderer.invoke('activate-license', key),
  restart: () => ipcRenderer.invoke('restart-app'),
});
```

- [ ] **Step 10: Integrar license guard en main.ts**

Editar `apps/desktop/src/main.ts`. Agregar la verificación de licencia en la función `bootstrap()` ANTES de llamar `startNestServer()`:

```typescript
import { checkLicense } from './license/trial';
import { verifyLocalToken } from './license/activation';
import { createActivationWindow } from './license/activation-window';

async function bootstrap(): Promise<void> {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }

  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });

  await app.whenReady();

  // ── LICENSE CHECK ──────────────────────────────────────────
  const licenseStatus = checkLicense();

  if (licenseStatus.status === 'invalid') {
    // Archivo corrupto o copiado de otra máquina
    await createActivationWindow();
  } else if (licenseStatus.status === 'expired') {
    await createActivationWindow();
  } else if (licenseStatus.status === 'active') {
    // Verificar que el token RSA es válido
    if (!verifyLocalToken()) {
      await createActivationWindow();
    }
  }
  // 'trial': continúa normalmente
  // ───────────────────────────────────────────────────────────

  await startNestServer();
  createTray();
  createWindow();

  if (!isDev) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  app.on('before-quit', () => { stopNestServer(); });
}
```

- [ ] **Step 11: Commit del License Guard**

```bash
git add apps/desktop/src/license/ apps/desktop/src/main.ts apps/desktop/src/preload.ts
git commit -m "feat(desktop/license): trial countdown, RSA token verification, activation window"
```

---

## Chunk 4: License Server — API Mínima en NestJS

### Task 4: Crear el License Server como paquete separado

**Files:**
- Create: `packages/license-server/package.json`
- Create: `packages/license-server/tsconfig.json`
- Create: `packages/license-server/prisma/schema.prisma`
- Create: `packages/license-server/src/main.ts`
- Create: `packages/license-server/src/license/license.module.ts`
- Create: `packages/license-server/src/license/license.controller.ts`
- Create: `packages/license-server/src/license/license.service.ts`
- Create: `packages/license-server/src/license/license.entity.ts`
- Create: `packages/license-server/src/license/dto.ts`
- Create: `packages/license-server/src/license/license.controller.spec.ts`
- Create: `packages/license-server/scripts/generate-keys.ts`

**Contexto:** NestJS minimalista deployado en Railway. Usa SQLite (Prisma) en dev y Postgres en producción. Genera tokens firmados con RSA-256. El par de claves RSA se genera UNA SOLA VEZ con el script `generate-keys.ts`; la clave privada solo existe en el servidor, la pública se embebe en el binario Electron.

- [ ] **Step 1: Crear package.json del license-server**

Crear `packages/license-server/package.json`:

```json
{
  "name": "@restaurants/license-server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start:prod": "node dist/main",
    "test": "jest",
    "generate-keys": "ts-node scripts/generate-keys.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@prisma/client": "^7.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^22.0.0",
    "jest": "^29.0.0",
    "prisma": "^7.0.0",
    "ts-jest": "^29.0.0",
    "ts-node": "^10.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Crear tsconfig.json para el license server**

Crear `packages/license-server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Crear schema Prisma con la tabla licenses**

Crear `packages/license-server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = DATABASE_PROVIDER  // "sqlite" en dev, "postgresql" en Railway
  url      = env("DATABASE_URL")
}

model License {
  key         String   @id
  machineId   String?
  platform    String?
  activatedAt DateTime?
  status      String   @default("available") // available | active | revoked
  createdAt   DateTime @default(now())
}
```

**Nota:** Para dev local usar `provider = "sqlite"` y `DATABASE_URL="file:./dev.db"`. Para Railway usar `provider = "postgresql"` con la URL de Postgres de Railway. Cambiar el provider antes de deploy.

```bash
cd packages/license-server
pnpm install
npx prisma generate
npx prisma db push  # crea la tabla en dev.db
```

- [ ] **Step 4: Script para generar el par de claves RSA**

Crear `packages/license-server/scripts/generate-keys.ts`:

```typescript
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const keysDir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(keysDir, { recursive: true });
fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);

console.log('✅ Keys generated in packages/license-server/keys/');
console.log('');
console.log('IMPORTANTE:');
console.log('1. Nunca commitear private.pem al repositorio');
console.log('2. Agregar keys/ a .gitignore');
console.log('3. Copiar public.pem a apps/desktop/resources/license.pub');
console.log('   y actualizar la constante PUBLIC_KEY en activation.ts');
```

Ejecutar:
```bash
pnpm --filter @restaurants/license-server install
pnpm --filter @restaurants/license-server run generate-keys
```

Esperado: `packages/license-server/keys/private.pem` y `public.pem` creados.

- [ ] **Step 5: Agregar keys/ al .gitignore**

Editar `.gitignore` en la raíz del monorepo, agregar:

```
packages/license-server/keys/
```

- [ ] **Step 6: Crear la entidad y DTOs**

Crear `packages/license-server/src/license/license.entity.ts`:

```typescript
export type LicenseStatus = 'available' | 'active' | 'revoked';

export interface License {
  key: string;
  machineId: string | null;
  platform: string | null;
  activatedAt: Date | null;
  status: LicenseStatus;
}
```

Crear `packages/license-server/src/license/dto.ts`:

```typescript
export class ActivateDto {
  licenseKey: string;
  machineId: string;
  platform: string;
}

export class DeactivateDto {
  licenseKey: string;
  adminToken: string;
}
```

- [ ] **Step 7: Crear LicenseService**

Crear `packages/license-server/src/license/license.service.ts`:

```typescript
import { Injectable, ConflictException, NotFoundException, GoneException } from '@nestjs/common';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ActivateDto, DeactivateDto } from './dto';

// Cargar clave privada desde disco (Railway: variable de entorno)
function getPrivateKey(): string {
  const envKey = process.env.RSA_PRIVATE_KEY;
  if (envKey) return envKey.replace(/\\n/g, '\n');
  const keyPath = path.join(__dirname, '..', '..', 'keys', 'private.pem');
  return fs.readFileSync(keyPath, 'utf-8');
}

function signPayload(payload: object): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sign = crypto.createSign('SHA256');
  sign.update(payloadB64);
  const signature = sign.sign(getPrivateKey());
  return signature.toString('base64') + '.' + payloadB64;
}

@Injectable()
export class LicenseService {
  constructor(private readonly prisma: PrismaClient) {}

  async activate(dto: ActivateDto): Promise<{ token: string }> {
    const license = await this.prisma.license.findUnique({
      where: { key: dto.licenseKey },
    });

    if (!license) {
      throw new NotFoundException('License key not found');
    }
    if (license.status === 'revoked') {
      throw new GoneException('License has been revoked');
    }
    if (license.status === 'active' && license.machineId !== dto.machineId) {
      throw new ConflictException('License is already in use on another machine');
    }

    const activatedAt = new Date();
    await this.prisma.license.update({
      where: { key: dto.licenseKey },
      data: {
        machineId: dto.machineId,
        platform: dto.platform,
        activatedAt,
        status: 'active',
      },
    });

    const token = signPayload({
      licenseKey: dto.licenseKey,
      machineId: dto.machineId,
      activatedAt: activatedAt.toISOString(),
    });

    return { token };
  }

  async deactivate(dto: DeactivateDto): Promise<{ message: string }> {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken || dto.adminToken !== adminToken) {
      throw new ConflictException('Invalid admin token');
    }

    const license = await this.prisma.license.findUnique({
      where: { key: dto.licenseKey },
    });
    if (!license) throw new NotFoundException('License key not found');

    await this.prisma.license.update({
      where: { key: dto.licenseKey },
      data: { machineId: null, platform: null, activatedAt: null, status: 'available' },
    });

    return { message: 'License deactivated — machine slot freed' };
  }
}
```

- [ ] **Step 8: Crear LicenseController**

Crear `packages/license-server/src/license/license.controller.ts`:

```typescript
import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { LicenseService } from './license.service';
import { ActivateDto, DeactivateDto } from './dto';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Post('activate')
  @HttpCode(200)
  activate(@Body() dto: ActivateDto) {
    return this.licenseService.activate(dto);
  }

  @Post('deactivate')
  @HttpCode(200)
  deactivate(@Body() dto: DeactivateDto) {
    return this.licenseService.deactivate(dto);
  }
}
```

- [ ] **Step 9: Escribir tests para LicenseService**

Crear `packages/license-server/src/license/license.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

// Mock de crypto.createSign para tests
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    createSign: jest.fn().mockReturnValue({
      update: jest.fn(),
      sign: jest.fn().mockReturnValue(Buffer.from('mock-signature')),
    }),
  };
});

// Mock de fs para no necesitar el archivo de clave real en tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn().mockReturnValue('MOCK_PRIVATE_KEY'),
}));

describe('LicenseController', () => {
  let controller: LicenseController;
  let service: LicenseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LicenseController],
      providers: [LicenseService],
    }).compile();

    controller = module.get(LicenseController);
    service = module.get(LicenseService);
  });

  describe('POST /license/activate', () => {
    it('activates a valid license key', async () => {
      const result = await controller.activate({
        licenseKey: 'TEST-XXXX-YYYY-ZZZZ',
        machineId: 'machine-abc',
        platform: 'win32',
      });
      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
    });

    it('throws NotFoundException for unknown key', async () => {
      await expect(
        controller.activate({ licenseKey: 'UNKNOWN', machineId: 'abc', platform: 'win32' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if license is used on a different machine', async () => {
      await controller.activate({
        licenseKey: 'TEST-XXXX-YYYY-ZZZZ',
        machineId: 'machine-1',
        platform: 'win32',
      });
      await expect(
        controller.activate({
          licenseKey: 'TEST-XXXX-YYYY-ZZZZ',
          machineId: 'machine-2',
          platform: 'darwin',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows re-activation on the same machine', async () => {
      await controller.activate({ licenseKey: 'TEST-XXXX-YYYY-ZZZZ', machineId: 'machine-1', platform: 'win32' });
      const result = await controller.activate({ licenseKey: 'TEST-XXXX-YYYY-ZZZZ', machineId: 'machine-1', platform: 'win32' });
      expect(result).toHaveProperty('token');
    });
  });
});
```

```bash
pnpm --filter @restaurants/license-server test
```

Esperado: PASS (4 tests).

- [ ] **Step 10: Crear main.ts del license server**

Crear `packages/license-server/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { LicenseModule } from './license/license.module';

@Module({ imports: [LicenseModule] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: false }); // Solo acepta requests del binario Electron
  await app.listen(process.env.PORT || 4000);
  console.log(`License server running on port ${process.env.PORT || 4000}`);
}

bootstrap();
```

Crear `packages/license-server/src/license/license.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';

@Module({
  controllers: [LicenseController],
  providers: [
    LicenseService,
    { provide: PrismaClient, useValue: new PrismaClient() },
  ],
})
export class LicenseModule {}
```

- [ ] **Step 11: Probar el license server localmente**

```bash
pnpm --filter @restaurants/license-server dev
```

En otra terminal:
```bash
curl -X POST http://localhost:4000/license/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"TEST-XXXX-YYYY-ZZZZ","machineId":"test-machine","platform":"darwin"}'
```

Esperado: respuesta `{ "token": "..." }`.

```bash
# Intentar activar la misma clave en otra máquina
curl -X POST http://localhost:4000/license/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"TEST-XXXX-YYYY-ZZZZ","machineId":"other-machine","platform":"win32"}'
```

Esperado: `409 Conflict`.

- [ ] **Step 12: Commit**

```bash
git add packages/license-server/
git commit -m "feat(license-server): NestJS license API with RSA signing, activate/deactivate endpoints"
```

---

## Chunk 5: Protección de Código

### Task 5: bytenode + Electron Fuses + javascript-obfuscator

**Files:**
- Create: `apps/desktop/scripts/protect.mjs`
- Create: `apps/desktop/scripts/apply-fuses.mjs`
- Modify: `apps/desktop/package.json`

**Contexto:** Tres capas de protección aplicadas en el pipeline de build ANTES de que Electron Builder empaquete. bytenode compila el JS de NestJS a bytecode V8 (`.jsc`). javascript-obfuscator ofusca los archivos de entrada de Electron (main.js, preload.js). Electron Fuses desactiva DevTools y el debugger remoto en el binario final.

- [ ] **Step 1: Crear script de bytenode para NestJS**

Crear `apps/desktop/scripts/protect.mjs`:

```javascript
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..', '..');

// === 1. BYTENODE: compilar NestJS dist/ a .jsc ===
console.log('🔒 Compilando NestJS a bytecode V8 con bytenode...');

const nestDist = path.join(ROOT, 'apps', 'api-core', 'dist');
const jsFiles = getAllJsFiles(nestDist);

for (const jsFile of jsFiles) {
  execSync(`npx bytenode --compile "${jsFile}"`, { stdio: 'inherit' });
  // Reemplazar el .js con el .jsc (el .js no debe quedar en el paquete)
  fs.unlinkSync(jsFile);
  console.log(`  ✓ ${path.relative(nestDist, jsFile)} → .jsc`);
}

// Crear un loader mínimo para main.jsc (bytenode necesita ser requerido primero)
const mainJsc = path.join(nestDist, 'main.jsc');
if (fs.existsSync(mainJsc)) {
  fs.writeFileSync(
    path.join(nestDist, 'main.js'),
    `require('bytenode');\nrequire('./main.jsc');`,
  );
}

// === 2. OBFUSCADOR: ofuscar archivos de entrada de Electron ===
console.log('🔒 Ofuscando archivos de entrada de Electron...');

const desktopDist = path.join(ROOT, 'apps', 'desktop', 'dist');
const electronEntryFiles = ['main.js', 'preload.js'];

for (const filename of electronEntryFiles) {
  const filePath = path.join(desktopDist, filename);
  if (!fs.existsSync(filePath)) continue;

  const source = fs.readFileSync(filePath, 'utf-8');
  const obfuscated = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false, // no agrega código falso (aumenta tamaño)
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    renameGlobals: false, // puede romper Electron si se activa
    selfDefending: false, // puede interferir con Electron
  }).getObfuscatedCode();

  fs.writeFileSync(filePath, obfuscated);
  console.log(`  ✓ ${filename} ofuscado`);
}

console.log('✅ Protección de código completada');

function getAllJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getAllJsFiles(fullPath));
    else if (entry.name.endsWith('.js')) results.push(fullPath);
  }
  return results;
}
```

- [ ] **Step 2: Crear script de Electron Fuses**

Crear `apps/desktop/scripts/apply-fuses.mjs`:

```javascript
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Electron Builder genera el binario en dist/
// Este script se ejecuta DESPUÉS de que Electron Builder empaquete
const platform = process.platform;

function getElectronBinaryPath(appName) {
  if (platform === 'win32') return path.join(__dirname, '..', 'dist', 'win-unpacked', `${appName}.exe`);
  if (platform === 'darwin') return path.join(__dirname, '..', 'dist', 'mac', `${appName}.app`, 'Contents', 'MacOS', appName);
  throw new Error(`Platform ${platform} not supported`);
}

const appName = 'Restaurant POS';

async function applyFuses() {
  const electronPath = getElectronBinaryPath(appName);
  console.log(`🔒 Aplicando Electron Fuses a: ${electronPath}`);

  await flipFuses(electronPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,               // Desactiva --inspect, --require
    [FuseV1Options.EnableCookieEncryption]: true,   // Encripta cookies del renderer
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,  // Desactiva debugger remoto
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // Verifica ASAR al arrancar
    [FuseV1Options.OnlyLoadAppFromAsar]: true,       // Bloquea carga fuera del ASAR
  });

  console.log('✅ Electron Fuses aplicados');
}

applyFuses().catch(console.error);
```

- [ ] **Step 3: Agregar scripts de build a package.json del desktop**

Editar `apps/desktop/package.json`, actualizar el campo `scripts`:

```json
{
  "scripts": {
    "dev": "tsc && electron .",
    "build": "tsc",
    "build:protected": "tsc && node scripts/protect.mjs",
    "pack": "npm run build:protected && electron-builder --dir && node scripts/apply-fuses.mjs",
    "dist:win": "npm run build:protected && electron-builder --win && node scripts/apply-fuses.mjs",
    "dist:mac": "npm run build:protected && electron-builder --mac && node scripts/apply-fuses.mjs",
    "postinstall": "electron-rebuild"
  }
}
```

- [ ] **Step 4: Verificar que protect.mjs funciona**

```bash
# Build todo primero
pnpm --filter api-core build
pnpm --filter @restaurants/desktop build

# Ejecutar protección
cd apps/desktop && node scripts/protect.mjs
```

Esperado:
- `apps/api-core/dist/` ya no tiene archivos `.js` — solo `.jsc`
- `apps/api-core/dist/main.js` es el tiny loader de bytenode
- `apps/desktop/dist/main.js` y `preload.js` están ofuscados (código ilegible)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/scripts/
git commit -m "feat(desktop/security): bytenode V8 bytecode, javascript-obfuscator, Electron Fuses"
```

---

## Chunk 6: Electron Builder — Packaging Win + Mac

### Task 6: Configurar electron-builder para distribución

**Files:**
- Create: `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/.env.example`
- Modify: `apps/desktop/package.json` (agregar campo `build`)

**Contexto:** Electron Builder empaqueta el binario firmado para Windows (NSIS installer) y macOS (DMG). Los recursos incluidos son: `apps/api-core/dist/` (NestJS compiled), `apps/ui-dashboard/dist/` (Astro static), y `apps/desktop/resources/` (íconos, clave pública RSA).

- [ ] **Step 1: Copiar la clave pública RSA al paquete desktop**

```bash
cp packages/license-server/keys/public.pem apps/desktop/resources/license.pub
```

`activation.ts` ya fue escrito en Chunk 3 con `getPublicKey()` que lee `license.pub` desde `resources/`. Este paso solo copia el archivo real para que `verifyLocalToken()` funcione correctamente. Verificar que el archivo fue copiado:

```bash
head -1 apps/desktop/resources/license.pub
```

Esperado: `-----BEGIN PUBLIC KEY-----`

- [ ] **Step 2: Crear electron-builder.yml**

Crear `apps/desktop/electron-builder.yml`:

```yaml
appId: com.tu-empresa.restaurant-pos
productName: Restaurant POS
copyright: Copyright © 2026 Tu Empresa

# Directorios de entrada/salida
directories:
  buildResources: resources
  output: dist

# Archivos incluidos en el paquete
files:
  - dist/**/*          # Electron main (compilado + ofuscado)
  - resources/**/*     # Íconos, license.pub

# Recursos extra (NestJS + Astro) — NO van en app.asar sino en extraResources
extraResources:
  - from: ../../api-core/dist
    to: api-core/dist
    filter:
      - "**/*.jsc"
      - "**/*.js"      # solo el loader de bytenode
      - "**/*.json"    # package.json, prisma schema
  - from: ../../ui-dashboard/dist
    to: ui-dashboard/dist
  - from: resources/license.pub
    to: license.pub

# Integridad del ASAR
asar: true
asarUnpack:
  - "node_modules/better-sqlite3/**"  # native module no puede ir en ASAR

# Windows
win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico
  # Para firma real: certificateFile y certificatePassword via env vars
  # certificateFile: ${env.WIN_CERT_PATH}
  # certificatePassword: ${env.WIN_CERT_PASSWORD}

nsis:
  oneClick: false           # muestra el wizard de instalación
  perMachine: false         # instala por usuario (no requiere admin)
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: Restaurant POS

# macOS
mac:
  target:
    - target: dmg
      arch: [x64, arm64]   # Intel + Apple Silicon
  icon: resources/icon.icns
  category: public.app-category.business
  # Para notarización real:
  # notarize: true
  # teamId: ${env.APPLE_TEAM_ID}

dmg:
  title: Restaurant POS ${version}

# Auto-updater (electron-updater)
publish:
  provider: github
  owner: tu-usuario
  repo: restaurant-pos-releases
  private: true
```

- [ ] **Step 3: Crear placeholders de íconos**

```bash
# Crear íconos placeholder (reemplazar con diseños reales)
# Windows necesita .ico, macOS necesita .icns
# Por ahora, el ícono de tray PNG del Chunk 2 es suficiente para testing
# Para distribución real, generar con electron-icon-builder o iconutil (macOS)
echo "Recordatorio: reemplazar apps/desktop/resources/icon.ico y icon.icns antes de distribuir"
```

- [ ] **Step 4: Probar el packaging en modo --dir (sin instalador)**

```bash
# Build completo
pnpm --filter api-core build
pnpm --filter @restaurants/ui-dashboard build
pnpm --filter @restaurants/desktop pack
```

Esperado: genera `apps/desktop/dist/win-unpacked/` (en Windows) o `apps/desktop/dist/mac/` (en macOS) con el binario ejecutable. Sin errores de firma (la firma se hace con certificados reales más adelante).

Verificar que el binario arranca:
```bash
# Windows
./apps/desktop/dist/win-unpacked/Restaurant\ POS.exe

# macOS
open apps/desktop/dist/mac/Restaurant\ POS.app
```

Esperado: abre Electron, intenta arrancar NestJS, muestra el dashboard.

- [ ] **Step 5: Verificar protección — intentar extraer el ASAR**

```bash
# Intentar extraer el ASAR del binario empaquetado
npx asar extract apps/desktop/dist/win-unpacked/resources/app.asar /tmp/extracted
ls /tmp/extracted/dist/
```

Esperado: los archivos `.js` de Electron están ofuscados (ilegibles). Los recursos de NestJS (`api-core/`) están en `extraResources/` como `.jsc` binarios, no en el ASAR.

- [ ] **Step 6: Crear .env.example para el license server en Railway**

Crear `packages/license-server/.env.example`:

```bash
# Puerto (Railway lo asigna automáticamente)
PORT=4000

# Clave privada RSA (copiar contenido de keys/private.pem, reemplazar newlines con \n)
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTU_CLAVE_AQUI\n-----END PRIVATE KEY-----"

# Token para deactivate endpoint (genera uno random)
ADMIN_TOKEN=tu-token-admin-secreto-aqui
```

- [ ] **Step 7: Commit final**

```bash
git add apps/desktop/electron-builder.yml \
        packages/license-server/.env.example \
        apps/desktop/resources/license.pub \
        apps/desktop/resources/icon.ico \
        apps/desktop/resources/icon.icns \
        apps/desktop/resources/tray-icon.png
git commit -m "feat(desktop/build): electron-builder config for Win+Mac packaging, extraResources layout"
```

---

## Resumen de Verificación End-to-End

Ejecutar estos pasos en orden para confirmar que todo funciona antes de distribuir:

```bash
# 1. Build completo del monorepo
pnpm --filter api-core build
pnpm --filter @restaurants/ui-dashboard build

# 2. Tests del license guard
pnpm --filter @restaurants/desktop test

# 3. Tests del license server
pnpm --filter @restaurants/license-server test

# 4. Arrancar license server local
pnpm --filter @restaurants/license-server dev &

# 5. Packaging en modo --dir
pnpm --filter @restaurants/desktop pack

# 6. Ejecutar el binario
# (ver Step 4 del Chunk 6)
```

**Checklist de verificación manual:**
- [ ] App abre y muestra trial con 15 días
- [ ] Activar con `TEST-XXXX-YYYY-ZZZZ` → app se reinicia y funciona normalmente
- [ ] Copiar `license.enc` a otra carpeta y cambiar el userData path → bloqueado por machineId
- [ ] Intentar activar misma clave en machineId diferente → error 409
- [ ] Extraer `app.asar` → archivos JS ofuscados; `api-core/` son `.jsc` binarios
