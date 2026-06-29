# Imagen api-core ofuscada — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar una variante `prod-obfuscated` de la imagen de api-core con el `dist/` ofuscado, que se ejecuta idéntica a la no ofuscada, para que el código distribuido no sirva como base de un proyecto derivado.

**Architecture:** Se agrega `javascript-obfuscator` como devDependency de api-core y un script auto-contenido `apps/api-core/scripts/obfuscate.mjs` que ofusca `dist/` in-place con settings conservadores (seguros para NestJS). En el Dockerfile se agregan dos stages: `obfuscate` (deriva de `build`, corre el script) y `prod-obfuscated` (igual que `prod` pero copia el `dist/` ofuscado). El stage `prod` queda intacto para cloud/Railway.

**Tech Stack:** NestJS + Docker multi-stage, `javascript-obfuscator@^4.1.1`, pnpm. Spec: `docs/superpowers/specs/2026-06-29-obfuscated-api-core-image-design.md`.

---

## Convenciones de ejecución

- Trabajar desde la raíz del repo: `/Users/ronny/projects/restaurants`.
- El build context de api-core es `apps/api-core/`. Todo lo que el Dockerfile use debe vivir ahí.
- NO tocar el stage `prod` ni los stages `deps`/`prod-deps`/`build`/`dev` existentes salvo el `COPY scripts` indicado.
- NO tocar `packages/build-tools/` (es del flujo desktop).
- Hay un cambio ajeno sin commitear en `apps/ui/src/components/dash/orders/OrdersPanel.tsx`: NO incluirlo en ningún commit (usar `git add` con rutas explícitas).
- Rama actual de trabajo: `feat/onboarding-v2-pais-separador-errores`. Quedarse en ella.
- Commits frecuentes, uno por tarea.

---

## File Structure

**Nuevos:**
- `apps/api-core/scripts/obfuscate.mjs` — ofusca `apps/api-core/dist/` in-place.

**Modificados:**
- `apps/api-core/package.json` — `javascript-obfuscator` en devDependencies.
- `apps/api-core/pnpm-lock.yaml` — regenerado por pnpm.
- `apps/api-core/Dockerfile` — `COPY scripts` en `build`; stages `obfuscate` y `prod-obfuscated`.
- `docs/self-hosting-publishing.md` — publicar con `--target prod-obfuscated`.
- `docs/railway-deployment.md` — aclarar que Railway usa `prod` (sin ofuscar).

---

## Task 1: Dependencia + script de ofuscación

**Files:**
- Modify: `apps/api-core/package.json`
- Modify: `apps/api-core/pnpm-lock.yaml` (regenerado)
- Create: `apps/api-core/scripts/obfuscate.mjs`

- [ ] **Step 1: Agregar la devDependency**

En `apps/api-core/package.json`, dentro de `"devDependencies"` (que empieza en la línea ~69), agregar la entrada en orden alfabético — justo después de `"@eslint/js"` y antes de `"@nestjs/cli"` no es alfabético; ubicarla donde corresponda alfabéticamente entre las claves existentes (las `j...`). Si dudás del orden exacto, agregala como primera clave del objeto; pnpm la reordena igual. La línea a agregar:

```json
    "javascript-obfuscator": "^4.1.1",
```

- [ ] **Step 2: Regenerar el lockfile**

El Dockerfile instala con `--frozen-lockfile`, así que el lock debe incluir la nueva dependencia.

Run: `cd apps/api-core && pnpm install`
Expected: instala `javascript-obfuscator` y actualiza `apps/api-core/pnpm-lock.yaml` sin errores.

- [ ] **Step 3: Crear el script de ofuscación**

Crear `apps/api-core/scripts/obfuscate.mjs` con exactamente este contenido:

```js
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// El script vive en apps/api-core/scripts/ → dist está un nivel arriba.
const distDir = resolve(__dirname, '../dist');

// Settings conservadores: seguros para NestJS (preservan metadata de decoradores
// y nombres de clases/métodos para que la inyección de dependencias siga funcionando).
const OPTIONS = {
  renameGlobals: false,
  stringArray: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayEncoding: ['base64'],
  deadCodeInjection: false,
  controlFlowFlattening: false,
};

function obfuscateDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      obfuscateDir(full);
    } else if (entry.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');
      const result = JavaScriptObfuscator.obfuscate(source, OPTIONS);
      writeFileSync(full, result.getObfuscatedCode(), 'utf8');
    }
  }
}

obfuscateDir(distDir);
console.log('✓ api-core dist obfuscated in place');
```

- [ ] **Step 4: Verificar el script localmente — compilar y ofuscar**

Generar el `dist/` real y ofuscarlo:

Run: `cd apps/api-core && pnpm run build && node ./scripts/obfuscate.mjs`
Expected: el build genera `dist/`, el script imprime `✓ api-core dist obfuscated in place` sin errores.

- [ ] **Step 5: Verificar que el dist quedó ofuscado**

Run: `cd apps/api-core && head -c 400 dist/src/main.js`
Expected: el contenido se ve ofuscado (identificadores tipo `_0x...`, arrays de strings), NO el JS legible original.

- [ ] **Step 6: Verificar que el dist ofuscado AÚN arranca (gate de NestJS)**

Levantar el server ofuscado apuntando a la DB de dev ya corriendo. Desde la raíz:

Run:
```bash
docker compose up -d res-db
cd apps/api-core && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/restaurants" \
  JWT_SECRET="local-dev-secret-at-least-32-chars-long-aaaa" JWT_ACCESS_EXPIRATION=15m \
  JWT_REFRESH_EXPIRATION=7d BCRYPT_SALT_ROUNDS=10 CACHE_DRIVER=memory NODE_ENV=production \
  PORT=3009 node dist/src/main &
sleep 8 && curl -s http://localhost:3009/health; echo; kill %1 2>/dev/null || true
```
Expected: `{"status":"ok"}` — Nest arranca con el `dist` ofuscado sin errores de DI/reflection.

> Si el puerto/DB difiere en este entorno, ajustar `DATABASE_URL`/`PORT`. Lo esencial: arrancar `node dist/src/main` con el dist ofuscado y obtener `/health` 200. Si NestJS falla por la ofuscación, reportarlo (status BLOCKED) — habría que afinar `OPTIONS` (ej. excluir `dist/src/main.js`).

- [ ] **Step 7: Limpiar el dist de prueba**

Run: `cd apps/api-core && rm -rf dist`
(Es artefacto de build local; no se commitea.)

- [ ] **Step 8: Commit**

```bash
git add apps/api-core/package.json apps/api-core/pnpm-lock.yaml apps/api-core/scripts/obfuscate.mjs
git commit -m "feat(api-core): script de ofuscación del dist (javascript-obfuscator)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Stages `obfuscate` y `prod-obfuscated` en el Dockerfile

**Files:**
- Modify: `apps/api-core/Dockerfile`

- [ ] **Step 1: Hacer que el stage `build` incluya `scripts/`**

En `apps/api-core/Dockerfile`, en el stage `build`, después de la línea `COPY commands ./commands` (línea ~49), agregar:

```dockerfile
COPY scripts  ./scripts
```

(Queda junto a los demás COPY de fuentes del stage `build`. El stage `build` hereda `node_modules` completos del stage `deps`, por lo que `javascript-obfuscator` ya estará disponible.)

- [ ] **Step 2: Agregar los stages `obfuscate` y `prod-obfuscated` al final del archivo**

Al final de `apps/api-core/Dockerfile` (después del `CMD` del stage `prod`, línea ~119), agregar:

```dockerfile

# ============================
# Stage: obfuscate
# ============================
FROM build AS obfuscate

# Ofusca /builder/dist in-place. javascript-obfuscator viene en los node_modules
# heredados del stage 'deps'. WORKDIR es /builder (del stage build).
RUN node ./scripts/obfuscate.mjs

# ============================
# Stage: prod-obfuscated
# ============================
# Idéntico a 'prod', salvo que el dist proviene del stage 'obfuscate'.
FROM node:24.15.0-bookworm-slim AS prod-obfuscated

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y && apt-get install -y openssl --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm \
    && rm -f /usr/local/bin/npx

WORKDIR /app

COPY --from=obfuscate --chown=node:node /builder/dist           ./dist
COPY --from=prod-deps --chown=node:node /prod-deps/node_modules ./node_modules
COPY --from=build     --chown=node:node /builder/prisma         ./prisma
COPY --from=build     --chown=node:node /builder/commands       ./commands
COPY --chown=node:node prisma.config.ts ./prisma.config.ts

RUN chmod +x ./commands/execute-migrations.sh ./commands/resend-activation.sh

RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node

EXPOSE 3000

CMD ["sh", "-c", "node dist/src/main"]
```

- [ ] **Step 3: Build de la imagen ofuscada (una sola arch, local)**

Run: `docker build -f apps/api-core/Dockerfile --target prod-obfuscated -t restaurants-api-core:obf apps/api-core`
Expected: build OK, incluyendo el step `RUN node ./scripts/obfuscate.mjs` (imprime el `✓`).

- [ ] **Step 4: Verificar que el dist DENTRO de la imagen está ofuscado**

Run: `docker run --rm --entrypoint sh restaurants-api-core:obf -c "head -c 400 dist/src/main.js"`
Expected: contenido ofuscado (`_0x...` / arrays de strings), no el JS legible.

- [ ] **Step 5: Verificar que `prod` (no ofuscado) sigue intacto**

Run: `docker build -f apps/api-core/Dockerfile --target prod -t restaurants-api-core:plain apps/api-core && docker run --rm --entrypoint sh restaurants-api-core:plain -c "head -c 200 dist/src/main.js"`
Expected: build OK y el dist de `prod` se ve **legible** (sin ofuscar) — confirma que el stage `prod` no fue afectado.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/Dockerfile
git commit -m "feat(docker): stage prod-obfuscated con dist ofuscado (prod queda intacto)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Verificación e2e del stack con la imagen ofuscada

**Files:** ninguno (verificación). No marcar completo si algún paso falla.

- [ ] **Step 1: Etiquetar la imagen ofuscada para el compose de self-host**

Run: `docker tag restaurants-api-core:obf ghcr.io/local/restaurants-api-core:latest`
(La UI puede reusarse de pruebas previas; si no existe, buildearla:
`docker build -f apps/ui/Dockerfile --target prod --build-arg PUBLIC_API_URL=__PLACEHOLDER_API_URL__ -t ghcr.io/local/restaurants-ui:latest apps/ui`.)

- [ ] **Step 2: Levantar el stack self-host con la imagen ofuscada**

Crear `deploy/.env` (no se commitea — `deploy/.gitignore` ya lo ignora) con:
```
GHCR_OWNER=local
SERVER_IP=127.0.0.1
API_PORT=3100
UI_PORT=8090
JWT_SECRET=obf-e2e-test-secret-at-least-32-chars-long-aaa
POSTGRES_PASSWORD=obftestpass
RESEND_API_KEY=
GEMINI_API_KEY=
```
Run: `cd deploy && docker compose up -d`
Expected: los tres servicios arrancan.

- [ ] **Step 3: Verificar arranque, migraciones y health**

Run:
```bash
cd deploy && docker compose logs res-api-core | grep -iE "migrations have been|successfully started"
curl -s http://localhost:3100/health
```
Expected: migraciones aplicadas, `Nest application successfully started`, y `/health` → `{"status":"ok"}`.

- [ ] **Step 4: Verificar el flujo self-host (onboarding/registro)**

Run:
```bash
curl -s -X POST http://localhost:3100/v1/onboarding/register \
  -H "Origin: http://127.0.0.1:8090" -F email=obf@test.com -F restaurantName=Obf -F country=CL -F timezone=America/Santiago
```
Expected: respuesta 201 con JSON que incluye `activationUrl` (modo self-hosted) — confirma que onboarding completo funciona con el dist ofuscado.
(El campo exacto del formulario puede variar; si el DTO requiere otros campos, ajustarlos. Lo esencial: obtener un 201 con `activationUrl`.)

- [ ] **Step 5: Verificar la lista de países (endpoint público)**

Run: `curl -s -H "Origin: http://127.0.0.1:8090" http://localhost:3100/v1/onboarding/countries | head -c 120`
Expected: JSON con la lista de países (no vacío) — confirma que el endpoint sirve datos con el dist ofuscado.

- [ ] **Step 6: Correr la suite de api-core (control de regresión del fuente)**

Run: `docker compose exec res-api-core pnpm test 2>&1 | tail -15`
Expected: suite verde. (Corre sobre `src`, no sobre el dist ofuscado; valida que nada del fuente se rompió.)

- [ ] **Step 7: Limpiar**

Run: `cd deploy && docker compose down -v && rm -f .env`
Expected: stack abajo, `.env` eliminado. Confirmar `git status` solo muestra el `OrdersPanel.tsx` preexistente.

---

## Task 4: Documentar la publicación de la imagen ofuscada

**Files:**
- Modify: `docs/self-hosting-publishing.md`
- Modify: `docs/railway-deployment.md`

- [ ] **Step 1: Actualizar el comando de build de api-core en `self-hosting-publishing.md`**

En `docs/self-hosting-publishing.md`, en la sección "Build + push multi-arquitectura" (§3), en el comando del **backend**, cambiar `--target prod` por `--target prod-obfuscated`. El comando del backend queda:

```bash
# Backend (api-core) — imagen ofuscada para distribución
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/api-core/Dockerfile --target prod-obfuscated \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:latest \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:v1.0.0 \
  --push apps/api-core
```

(El comando de la UI no cambia.) Hacer el mismo cambio (`prod` → `prod-obfuscated`) en el comando de "publicar una versión nueva" (§6) y en el build local de prueba (§5) del backend.

- [ ] **Step 2: Añadir una nota explicativa en `self-hosting-publishing.md`**

En la sección "Cómo se compilan las imágenes", al final, agregar:

```markdown
### Imagen ofuscada para distribución (`prod-obfuscated`)

El backend se publica desde el stage **`prod-obfuscated`**, no `prod`. Ese stage parte del
`dist/` compilado y le aplica `javascript-obfuscator` (script `apps/api-core/scripts/obfuscate.mjs`,
settings conservadores seguros para NestJS) antes de empaquetarlo. El resultado se ejecuta
igual, pero el código no es utilizable como base de un proyecto derivado. El stage `prod`
(sin ofuscar) se reserva para el deploy cloud propio, donde conviene tener stack traces
legibles — ver `railway-deployment.md`.
```

- [ ] **Step 2b: Actualizar el inventario de stages del README de la UI/Dockerfile si aplica**

(No requerido — el README de UI documenta el Dockerfile de UI, no el de api-core. Saltar.)

- [ ] **Step 3: Aclarar en `railway-deployment.md` que Railway usa `prod`**

En `docs/railway-deployment.md`, en la sección "§3 Fuente de las imágenes", dentro de la
"Opción A — Build desde el repo", agregar al final:

```markdown
> **Stage para cloud:** Railway usa el stage **`prod`** (sin ofuscar), no `prod-obfuscated`.
> La ofuscación es solo para las imágenes que se **distribuyen** (self-host); en tu propio
> cloud conviene el `dist/` legible para debugging. Si configurás el Dockerfile Path en
> Railway, dejá que use el target por defecto (`prod`).
```

- [ ] **Step 4: Commit**

```bash
git add docs/self-hosting-publishing.md docs/railway-deployment.md
git commit -m "docs: publicar api-core desde el stage ofuscado; aclarar prod para cloud

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (cobertura del spec)

- **Mecanismo javascript-obfuscator, settings conservadores** → Task 1 (script con `OPTIONS`).
- **Solo backend** → Tasks 1-2 (todo en api-core; UI no se toca).
- **Stage `prod-obfuscated` aparte, `prod` intacto** → Task 2 (stages nuevos; Step 5 verifica `prod` legible).
- **devDependency + lockfile regenerado** → Task 1 (Steps 1-2).
- **Script auto-contenido en api-core** → Task 1 (Step 3), `COPY scripts` en Task 2 (Step 1).
- **Verificación: build, ofuscación efectiva, arranque Nest, flujo self-host, tests** → Task 1 (Steps 4-6), Task 2 (Steps 3-5), Task 3 (Steps 1-6).
- **Publicación con `--target prod-obfuscated`; Railway = `prod`** → Task 4.
- **Riesgo DI/reflection con gate de arranque real** → Task 1 Step 6, Task 3 Steps 3-5.
