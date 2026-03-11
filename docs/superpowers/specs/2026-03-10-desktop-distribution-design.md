# Desktop Distribution & Licensing — Design Spec

**Date:** 2026-03-10
**Status:** Approved

## Context

El MVP de restaurant-automation es una aplicación web (monorepo NestJS + Astro) que se quiere distribuir como un binario de escritorio para vender a restaurantes con licenciamiento por máquina. El cliente instala el binario en una PC del restaurante, que actúa como servidor local. El kiosk, pantalla de cocina y dashboard se conectan desde otros dispositivos vía LAN usando el browser.

---

## Decisiones Clave

| Decisión | Elección | Razón |
|---|---|---|
| Empaquetado | Electron | Node.js nativo, firma Win+Mac integrada, auto-updater, tray icon |
| OS target | Windows + macOS | Cubre el mercado principal; Linux se puede agregar después |
| Red | LAN local | Un servidor por restaurante; kiosk y cocina usan browser en LAN |
| Astro build | Static output | Todo el auth va por JWT a NestJS; SSR no es necesario |
| Licencias | Activación online única → offline | Robustez ante restaurantes con internet inestable |
| Trial | 15 días completos → bloqueo | Mejor experiencia de prueba; más simple que demo limitado |
| Protección | bytenode + Electron Fuses + RSA server | Capas complementarias; RSA es la barrera real de negocio |

---

## Arquitectura

### Topología en producción

```
PC del Restaurante (servidor)
└── restaurant-pos.exe / .app
    ├── Electron main process
    │   ├── License Guard (lee license.enc, verifica RSA offline)
    │   ├── Spawna NestJS como proceso hijo (localhost:3000)
    │   └── Abre BrowserWindow → localhost:3000
    └── NestJS (api-core)
        ├── REST API + Socket.IO
        ├── SQLite (better-sqlite3) — base de datos local
        └── ServeStaticModule → sirve ui-dashboard/dist/

Tablet kiosk (LAN)      → browser → 192.168.x.x:3000/storefront
Pantalla cocina (LAN)   → browser → 192.168.x.x:3000/kitchen
Dashboard adicional     → browser → 192.168.x.x:3000
```

### Cambios al monorepo

```
apps/
  api-core/              sin cambios
  ui-dashboard/
    astro.config.mjs     output: 'static'  ← único cambio
  ui-storefront/         sin cambios
  desktop/               NUEVO — Electron shell
    src/
      main.ts            main process: license check, spawn NestJS, open window
      preload.ts
      license/
        trial.ts         firstLaunchAt encriptado + OS keychain backup
        activation.ts    POST /activate → guarda token RSA firmado
        machine-id.ts    node-machine-id (UUID del hardware del OS)
    resources/           íconos, clave pública RSA embebida
    electron-builder.yml
    package.json

packages/
  license-server/        NUEVO — API mínima deployada en Railway
    src/
      license.controller.ts   POST /activate, POST /deactivate
      license.service.ts      valida key, registra machineId, emite JWT firmado
    package.json
```

---

## Sistema de Licencias

### Flujo de trial (primer arranque)

1. Electron lee `~/.config/restaurant-pos/license.enc`
2. No existe → crear con `{ firstLaunchAt, machineId }` encriptado AES-256
3. Backup del timestamp en OS Keychain (Windows Registry / macOS Keychain) para resistir manipulación de fechas
4. Cada arranque: calcular `días = hoy - firstLaunchAt`
   - ≤ 15 días → arrancar NestJS normalmente
   - \> 15 días → mostrar pantalla de activación, no arrancar NestJS

### Flujo de activación (una sola vez con internet)

```
App                          License Server (Railway)
 │                                    │
 │  POST /activate                    │
 │  { licenseKey, machineId, platform }──►  verificar key existe
 │                                    │    verificar no está en otro machineId
 │◄── { token: JWT firmado RSA-256 } ─┤    registrar machineId en DB
 │                                    │
 │  guarda token en license.enc       │
```

### Verificación offline (arranques posteriores)

```typescript
// En cada arranque — sin internet
const token = readAndDecrypt('license.enc')
const payload = jwt.verify(token, RSA_PUBLIC_KEY)  // clave pública embebida
assert(payload.machineId === getCurrentMachineId()) // anti-copia de archivo
// Si pasa → arrancar NestJS
```

### License Server — endpoints mínimos

```
POST /activate
  body: { licenseKey: string, machineId: string, platform: string }
  200: { token: string }   // JWT firmado con RSA private key
  409: "License already in use on another machine"
  404: "License key not found"
  410: "License revoked"

POST /deactivate   (uso interno tuyo, para soporte)
  body: { licenseKey: string, adminToken: string }
  200: "Deactivated — machine slot freed"
```

### Schema de licencias (tu base de datos)

```
licenses
  key          TEXT PRIMARY KEY   -- XXXX-XXXX-XXXX-XXXX
  machine_id   TEXT               -- null hasta activar
  platform     TEXT               -- win32 | darwin
  activated_at DATETIME
  status       TEXT               -- available | active | revoked
```

---

## Capas de Protección contra Ingeniería Inversa

| Capa | Herramienta | Qué protege | Efectividad |
|---|---|---|---|
| 1 | **bytenode** | Compila JS → bytecode V8 binario | Alta |
| 2 | **javascript-obfuscator** | Ofusca archivos de entrada (main, preload) | Media |
| 3 | **Electron Fuses** | Deshabilita DevTools y debugger remoto en producción | Media |
| 4 | **ASAR integrity + code signing** | Detecta modificaciones al ASAR post-distribución | Media |
| 5 | **RSA server signing** | Token válido solo generado por tu servidor; barrera real | Muy Alta |

**Nota:** El objetivo no es protección perfecta sino elevar el costo de crackeo por encima del costo de la licencia. Para el mercado de restaurantes, bytenode + Electron Fuses + RSA es más que suficiente.

---

## Pipeline de Build

```
1. pnpm --filter api-core build
        → compilar TypeScript → dist/

2. pnpm --filter ui-dashboard build
        → Astro static output → dist/

3. bytenode --compile api-core/dist/**/*.js
        → reemplazar .js por .jsc

4. javascript-obfuscator en archivos de entrada (main.js, preload.js)

5. electron-builder --win --mac
        → aplica Electron Fuses
        → firma binario (Authenticode / Apple notarization)
        → genera: setup.exe (NSIS) + app.dmg

6. Publicar en GitHub Releases / S3
        → electron-updater descarga actualizaciones automáticamente
```

---

## Dependencias nuevas

```jsonc
// apps/desktop/package.json
{
  "dependencies": {
    "electron": "^32",
    "node-machine-id": "^1.1.12"
  },
  "devDependencies": {
    "electron-builder": "^25",
    "electron-updater": "^6",
    "@electron/fuses": "^1",
    "bytenode": "^1",
    "javascript-obfuscator": "^4"
  }
}

// packages/license-server/package.json
{
  "dependencies": {
    "@nestjs/jwt": "already in api-core",
    "prisma": "already in api-core"
    // reutiliza el mismo stack NestJS + SQLite o Postgres en Railway
  }
}
```

---

## Verificación (cómo probar que funciona)

1. **Trial:** Instalar el binario, verificar que arranca sin clave. Modificar `firstLaunchAt` en el archivo encriptado → verificar que lo detecta (el timestamp del keychain no coincide).
2. **Activación:** Correr el license server local, activar con una clave de prueba → verificar que genera token y lo guarda. Desconectar internet → verificar que la app arranca correctamente.
3. **Anti-copia:** Copiar `license.enc` a otra máquina → verificar que el `machineId` no coincide y bloquea.
4. **Trial expirado:** Manipular `firstLaunchAt` a 16 días atrás → verificar que muestra pantalla de activación.
5. **Doble uso:** Intentar activar la misma clave en dos máquinas → verificar error 409.
6. **Obfuscación:** Extraer `app.asar` del binario → verificar que los `.jsc` no son legibles y los archivos de entrada están ofuscados.
