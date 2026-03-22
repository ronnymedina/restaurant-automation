# Guía: Build, Ofuscación y Electron

Esta guía explica cómo construir los artefactos protegidos (bytecode para cloud, binario para desktop) y cómo levantar Electron para desarrollo.

Todos los comandos se ejecutan desde la **raíz del repositorio**.

---

## Estructura de los scripts de build

Los scripts viven en `packages/build-tools/scripts/` pero **no son un workspace package**. Sus comandos están registrados en el `package.json` raíz y sus dependencias (`javascript-obfuscator`, `bytenode`, `@yao-pkg/pkg`) se instalan en el `node_modules` raíz.

```
packages/build-tools/scripts/
  ├── copy-static.mjs       Copia dist de Astro → api-core/public/
  ├── obfuscate.mjs         Ofusca api-core/dist/ in-place
  ├── compile-bytecode.mjs  Compila .js → .jsc con bytenode (cloud)
  └── compile-binary.mjs    Compila binario standalone con pkg (desktop)
```

---

## Pipeline completo paso a paso

### 1. Build de los frontends (Astro estático)

```bash
pnpm --filter @restaurants/ui-dashboard build
pnpm --filter @restaurants/ui-storefront build
```

Produce: `apps/ui-dashboard/dist/` y `apps/ui-storefront/dist/`

---

### 2. Build del backend (NestJS)

```bash
pnpm --filter api-core build
```

Produce: `apps/api-core/dist/`

---

### 3. Copiar estáticos al public del backend

```bash
pnpm copy-static
```

Copia ambos `dist/` de Astro a `apps/api-core/public/`:
- `ui-dashboard/dist/` → `api-core/public/` (dashboard principal en `/`)
- `ui-storefront/dist/` → `api-core/public/storefront/` (kiosco en `/storefront`)

Verificar:
```bash
ls apps/api-core/public/
# → _astro/  dash/  index.html  kitchen/  storefront/  ...
```

---

### 4. Ofuscación (paso previo al build de producción)

```bash
pnpm obfuscate
```

Modifica `apps/api-core/dist/` **in-place** con javascript-obfuscator.
Settings conservadores (seguros para decorators de NestJS):
- `renameGlobals: false`
- `deadCodeInjection: false`
- `controlFlowFlattening: false`
- `stringArray: true`, `stringArrayEncoding: ['base64']`

> ⚠️ Después de obfuscar, `dist/` queda alterado permanentemente.
> Para restaurar: `pnpm --filter api-core build`

Verificar que el servidor aún levanta:
```bash
cd apps/api-core && node dist/main.js
# NestJS debe levantar en :3000 sin errores
# Ctrl+C para detener
```

---

### 5a. Build cloud — bytecode `.jsc` (bytenode)

```bash
pnpm build:cloud
```

Ejecuta: obfuscate → compile-bytecode

Produce: `apps/api-core/dist-bytecode/` con archivos `.jsc`

Los `.jsc` requieren Node.js con `bytenode` en el servidor (Railway).
Ver `Dockerfile` del api-core para el pipeline completo de cloud.

---

### 5b. Build desktop — binario standalone (pkg)

```bash
pnpm build:desktop
```

Ejecuta: obfuscate → compile-binary

> ⚠️ **Primera vez:** descarga Node.js para cada plataforma (~150 MB × 3 targets). Puede tardar varios minutos.

Produce en `apps/api-core/dist-binary/`:
```
api-core-node22-win-x64         → Windows
api-core-node22-macos-x64       → Intel Mac
api-core-node22-macos-arm64     → Apple Silicon
```

Probar el binario macOS (Apple Silicon):
```bash
chmod +x apps/api-core/dist-binary/api-core-node22-macos-arm64

DATABASE_URL="file:./dev.db" \
  node apps/api-core/dist-binary/api-core-node22-macos-arm64
# NestJS debe levantar sin errores
```

> ⚠️ El binario necesita que `better-sqlite3.node` y el Prisma engine estén disponibles.
> En el app Electron, esto se configura con las env vars:
> - `PRISMA_QUERY_ENGINE_LIBRARY=<path>/prisma-query-engine`
> - `BETTER_SQLITE3_BINDING=<path>/better-sqlite3.node`
>
> Esto se implementa en el Plan 3 (apps/desktop).

---

## Pipeline completo con Turborepo

Para correr el pipeline completo automáticamente (respetando dependencias):

```bash
# Cloud (obfusca + bytecode)
turbo run //#build:cloud

# Desktop (obfusca + binario)
turbo run //#build:desktop
```

Turbo se encarga de ejecutar los pasos en el orden correcto:
```
ui-dashboard#build ──┐
                     ├──► //#copy-static ──► //#build:cloud
ui-storefront#build ─┘                  └──► //#build:desktop
                                              ↑
                               api-core#build ┘
```

---

## Levantar Electron (desarrollo manual)

> El Plan 3 (`apps/desktop`) implementará Electron completo con trial, licencias, system tray y spawneo automático del binario. Mientras tanto, para probar la UI en una ventana Electron:

### Prerequisito

```bash
pnpm add -g electron
```

### Crear main.js temporal

```js
// apps/desktop/main.js (temporal para pruebas)
const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { nodeIntegration: false }
  })
  win.loadURL('http://localhost:3000')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

### Levantar (dos terminales)

```bash
# Terminal 1 — NestJS + Astro
cd apps/api-core && pnpm start:dev

# Terminal 2 — Electron
electron apps/desktop/main.js
```

Esto abre el dashboard en una ventana nativa. El kiosco está en `http://localhost:3000/storefront`.

---

## Comandos rápidos de referencia

| Comando | Qué hace |
|---------|----------|
| `pnpm copy-static` | Copia Astro dist → api-core/public/ |
| `pnpm obfuscate` | Ofusca api-core/dist/ in-place |
| `pnpm build:cloud` | Obfusca + bytecode → dist-bytecode/ |
| `pnpm build:desktop` | Obfusca + binario → dist-binary/ |
| `turbo run //#build:cloud` | Pipeline completo cloud (con deps) |
| `turbo run //#build:desktop` | Pipeline completo desktop (con deps) |
| `pnpm --filter api-core build` | Recompila NestJS (restaura dist/ limpio) |
