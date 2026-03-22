# Pending: Deploy the Stack (Electron App)

Todo lo que falta para poder publicar la aplicación de escritorio en macOS y Windows.

---

## Estado actual

| Componente | Estado |
|------------|--------|
| Backend NestJS (`api-core`) | ✅ Funcional en dev y prod |
| Build cloud (bytecode) | ✅ Pipeline completo |
| Build desktop (binario standalone) | ✅ Pipeline completo |
| Frontend Astro (dashboard + kiosco) | ✅ Funcional |
| `apps/desktop` (Electron app) | ❌ No implementado (Plan 3) |
| Firma macOS (notarization) | ❌ Pendiente credenciales |
| Publicación Windows | ❌ Pendiente (SmartScreen warning aceptable por ahora) |
| Deploy license-server (Railway) | ❌ Pendiente deploy manual |

---

## 1. Implementar `apps/desktop` — Plan 3

El directorio `apps/desktop/` existe pero está vacío. Hay que implementar el Electron wrapper completo.

### Funcionalidades requeridas

- **Spawn del binario**: Electron ejecuta `api-core-node22-macos-arm64` (o el binario de la plataforma) en un proceso hijo
- **Health check**: Polling a `http://localhost:{PORT}/health` antes de abrir la ventana
- **BrowserWindow**: Abre `http://localhost:{PORT}` una vez que el backend levanta
- **System tray**: Icono en la barra del sistema con opciones básicas (mostrar, ocultar, salir)
- **Auto-start**: La app arranca automáticamente al iniciar el equipo (login item)
- **Puerto dinámico**: Seleccionar un puerto disponible y pasarlo como variable de entorno al binario
- **Trial y licencias**: Verificar licencia RSA al arrancar; si no hay licencia válida, mostrar pantalla de activación

### Variables de entorno para el binario

El binario necesita que los addons nativos estén en rutas absolutas:

```
DATABASE_URL=file:/path/absoluto/app.db
PRISMA_QUERY_ENGINE_LIBRARY=/path/a/resources/prisma-query-engine
BETTER_SQLITE3_BINDING=/path/a/resources/better-sqlite3.node
PORT=3456
JWT_SECRET=...
LICENSE_SERVER_URL=...
LICENSE_PUBLIC_KEY=...
```

### Archivos nativos (`resources/`)

`better-sqlite3.node` y el Prisma engine **no pueden** vivir dentro del virtual filesystem de `pkg`. Deben empaquetarse como recursos externos de Electron y extraerse a una ruta accesible en tiempo de ejecución.

Archivos a incluir en `extraResources` de `electron-builder`:

```
resources/
├── api-core-node22-macos-arm64     (binario NestJS — macOS Apple Silicon)
├── api-core-node22-macos-x64       (binario NestJS — macOS Intel)
├── api-core-node22-win-x64         (binario NestJS — Windows)
├── better-sqlite3.node             (compilado para la plataforma target)
└── libquery_engine-*.dylib.node    (Prisma query engine — plataforma target)
```

> Los `.node` de `better-sqlite3` y Prisma son específicos por plataforma y versión de Node.js. Hay que obtener los correctos para Node 22.

---

## 2. Configurar `electron-builder`

Instalar y configurar `electron-builder` en `apps/desktop/`.

### Archivo `electron-builder.config.js`

```js
module.exports = {
  appId: 'com.tuempresa.restaurantes',
  productName: 'Restaurantes',
  directories: {
    output: 'dist-electron',
  },
  files: ['main.js', 'preload.js', 'renderer/**/*'],
  extraResources: [
    { from: '../../apps/api-core/dist-binary/', to: 'bin/', filter: ['api-core-*'] },
    { from: 'resources/', to: 'resources/' },
  ],
  mac: {
    category: 'public.app-category.business',
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    icon: 'assets/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'entitlements.mac.plist',
    entitlementsInherit: 'entitlements.mac.plist',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'assets/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'assets/icon.ico',
  },
  publish: null, // sin auto-update por ahora
};
```

### `entitlements.mac.plist`

Necesario para hardenedRuntime (requisito de notarización):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
```

---

## 3. Firma y notarización macOS

Sin firma y notarización, macOS bloquea la app con "no se puede abrir porque el desarrollador no puede ser verificado".

### Requisitos

- [ ] **Apple Developer Program** — cuenta pagada ($99/año) en developer.apple.com
- [ ] **Certificado `Developer ID Application`** — en Xcode → Settings → Accounts → Manage Certificates
- [ ] **App-specific password** — en appleid.apple.com → Sign-In and Security → App-Specific Passwords
- [ ] **Team ID** — en developer.apple.com → Membership Details

### Variables de entorno para el pipeline de firma

```bash
APPLE_ID=tu@email.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
CSC_LINK=base64_del_certificado_p12     # o ruta al .p12
CSC_KEY_PASSWORD=contraseña_del_p12
```

### Flujo (lo hace `electron-builder` automáticamente si las vars están seteadas)

1. Firma el `.app` con `codesign`
2. Empaqueta como `.dmg`
3. Sube a Apple para notarización (`notarytool`)
4. Grapa el ticket de notarización (`stapler`)

### Habilitar Electron Fuses (seguridad)

Deshabilitar features de Electron que no se usan para reducir superficie de ataque:

```js
// postinstall script en apps/desktop
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

await flipFuses(require('electron'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
});
```

---

## 4. Publicación Windows

### Estado actual

No se requiere firma de código por ahora. El instalador NSIS funcionará pero Windows mostrará **SmartScreen warning** ("Windows protegió tu PC"). El usuario puede hacer clic en "Más información → Ejecutar de todas formas".

### Para eliminar el SmartScreen warning (futuro)

- [ ] **EV Code Signing Certificate** — de una CA reconocida (DigiCert, Sectigo, etc.) — ~$400-700/año
- [ ] Los certificados OV estándar ya no eliminan SmartScreen en Windows 11; se requiere EV o reputación acumulada

### Build Windows desde macOS

`electron-builder` puede compilar para Windows desde macOS usando Wine o en CI (GitHub Actions con runner `windows-latest`).

```yaml
# .github/workflows/build-windows.yml
jobs:
  build-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm build:desktop
      - run: pnpm --filter @restaurants/desktop electron-builder --win
```

---

## 5. Deploy license-server en Railway

El license-server debe estar corriendo antes de distribuir la app a clientes.

### Pasos

- [ ] Crear proyecto en [railway.app](https://railway.app)
- [ ] Conectar repositorio GitHub
- [ ] Configurar variables de entorno en Railway:
  ```
  DATABASE_URL=postgresql://...   (Railway PostgreSQL add-on)
  JWT_SECRET=<secreto_aleatorio_largo>
  ADMIN_API_KEY=<clave_secreta_para_admin>
  NODE_ENV=production
  ```
- [ ] Railway detecta `railway.toml` → usa `apps/license-server/Dockerfile`
- [ ] El Dockerfile aplica la migración Prisma automáticamente al arrancar:
  ```
  CMD node_modules/.bin/prisma migrate deploy && node dist/main
  ```
- [ ] Anotar la URL pública del servicio (ej. `https://license-server-production.up.railway.app`)
- [ ] Actualizar `LICENSE_SERVER_URL` en el Electron app

---

## 6. Iconos de la aplicación

Electron Builder necesita iconos en formatos específicos:

| Archivo | Uso | Dimensiones |
|---------|-----|-------------|
| `assets/icon.icns` | macOS | 1024×1024 (múltiples resoluciones dentro del .icns) |
| `assets/icon.ico` | Windows | 256×256 (múltiples tamaños dentro del .ico) |
| `assets/icon.png` | Linux / tray | 512×512 |

Herramientas: `iconutil` (macOS), [icoconvert.com](https://icoconvert.com), o script con `sharp`.

---

## 7. Checklist final antes de la primera distribución

- [ ] Plan 3 implementado: `apps/desktop/` con Electron wrapper completo
- [ ] Addons nativos empaquetados en `resources/` y correctamente referenciados
- [ ] `electron-builder.config.js` configurado
- [ ] Electron Fuses configurados
- [ ] Iconos en todos los formatos requeridos
- [ ] License-server desplegado en Railway con URL pública
- [ ] `LICENSE_SERVER_URL` y `LICENSE_PUBLIC_KEY` configurados en la app
- [ ] Build macOS: certificado `Developer ID Application` obtenido
- [ ] Build macOS: app-specific password configurada
- [ ] Build y firma de `.dmg` probados localmente
- [ ] Notarización exitosa (sin errores de `notarytool`)
- [ ] Build Windows: instalador NSIS generado y probado en VM Windows
- [ ] Instalador macOS probado en una máquina sin Xcode instalado
- [ ] Instalador Windows probado en una VM limpia (sin Node.js)

---

## Referencia rápida de comandos

```bash
# Build de los artefactos (desde raíz del repo)
pnpm --filter @restaurants/api-core build    # compilar NestJS
pnpm build:desktop                           # ofuscar + binario standalone

# Build del instalador Electron (desde apps/desktop)
pnpm --filter @restaurants/desktop build     # electron-builder (requiere Plan 3)

# Probar el binario directamente (sin Electron)
chmod +x apps/api-core/dist-binary/api-core-node22-macos-arm64
DATABASE_URL="file:./dev.db" ./apps/api-core/dist-binary/api-core-node22-macos-arm64
```
