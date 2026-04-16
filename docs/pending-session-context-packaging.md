# Contexto de sesión — Packaging macOS (continuar aquí)

## Estado del plan

Plan: `docs/superpowers/plans/2026-03-26-electron-macos-packaging.md`

| Task | Estado |
|------|--------|
| Task 1: Auto-generate JWT_SECRET | ✅ Completada (commits `844cf7e`, `1b012a1`) |
| Task 2: Binary mode smoke test | ❌ Falló — ver error abajo |
| Task 3: electron-builder config | 🔜 Pendiente |
| Task 4: Build DMG sin firma | 🔜 Pendiente |
| Task 5: Build DMG firmado | 🔜 Pendiente |

---

## Error en Task 2 — Binario desactualizado

Al correr `pnpm dev` con `ELECTRON_DEV_BACKEND` comentado, el binario falla con:

```
Error: Cannot find module './app.controller'
Require stack:
- /snapshot/restaurants/apps/api-core/dist/src/app.module.js
- /snapshot/restaurants/apps/api-core/dist/src/main.js
```

**Causa:** El binario en `apps/api-core/dist-binary/` es stale — fue compilado antes de que `app.controller` existiera en el código. pkg embebe un snapshot del código y no puede resolver módulos que no estaban al momento de la compilación.

**Fix requerido:** Reconstruir el binario antes de volver a probar.

### Comandos para reconstruir

```bash
# Desde la raíz del repo
pnpm --filter @restaurants/api-core build   # compila NestJS a dist/
pnpm build:desktop                          # ofusca + genera binario con pkg
```

Esto regenera `apps/api-core/dist-binary/api-core-node22-macos-arm64` (y los otros targets).

**Tiempo estimado:** 2-5 minutos.

---

## Task 2 — Pasos una vez reconstruido el binario

1. En `apps/desktop/.env`, comentar `ELECTRON_DEV_BACKEND`
2. Correr `pnpm dev` desde `apps/desktop`
3. Verificar en consola:
   - `[spawn] Starting binary: .../api-core-node22-macos-arm64 on port XXXXX`
   - Líneas `[api-core]` con logs de NestJS
   - `[spawn] Backend ready at http://localhost:XXXXX`
   - Browser abre al dashboard
4. Crear un registro de prueba, cerrar app, reabrir — verificar que persiste
5. Restaurar `ELECTRON_DEV_BACKEND` en `.env`

---

## Task 3 — electron-builder config (código)

Una vez pasado el smoke test, dispatchar subagente para:

**Crear** `apps/desktop/resources/entitlements.mac.plist`:
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

**Modificar** `apps/desktop/electron-builder.yml` — agregar al bloque `mac:`:
```yaml
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist
  notarize: true
```

---

## Task 4 — Build DMG sin firma

```bash
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64
```

Output esperado: `dist-electron/Restaurantes-1.0.0-arm64.dmg`

---

## Task 5 — Build DMG firmado

```bash
export APPLE_ID="tu@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
cd apps/desktop
npx electron-builder --mac --arm64
```

---

## Archivos relevantes

| Archivo | Descripción |
|---------|-------------|
| `apps/desktop/src/main.ts` | Entry point Electron — carga config antes de startServer |
| `apps/desktop/src/config/app-config.ts` | Auto-genera JWT_SECRET en userData/config.json |
| `apps/desktop/src/server/spawn.ts` | Spawna el binario NestJS como proceso hijo |
| `apps/desktop/src/tray/tray.ts` | Tray icon y menú |
| `apps/desktop/electron-builder.yml` | Config de empaquetado |
| `apps/desktop/resources/` | Íconos (.icns, .ico, .png) |
| `apps/api-core/dist-binary/` | Binarios NestJS compilados con pkg |
| `packages/build-tools/scripts/compile-binary.mjs` | Script que genera los binarios |
