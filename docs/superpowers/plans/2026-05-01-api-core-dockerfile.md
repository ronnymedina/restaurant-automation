# api-core Dockerfile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un Dockerfile multi-stage para `apps/api-core`, un `docker-compose.yml` para orquestación en dev, y un `.dockerignore` para proteger archivos sensibles.

**Architecture:** Cuatro stages: `deps` (instalación compartida con herramientas nativas), `build` (compilación NestJS + `pnpm deploy` para prod node_modules), `dev` (hot-reload vía volúmenes en docker-compose), `prod` (imagen limpia hardened — solo JS compilado y node). El stage `prod` parte de imagen base fresca para no heredar build tools ni devDeps.

**Tech Stack:** `node:24.15.0-trixie-slim`, pnpm 10.24.0, NestJS CLI, Prisma 7 (schema PostgreSQL), docker-compose v2, PostgreSQL 17-alpine

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `apps/api-core/Dockerfile` | Reemplazar (actualmente vacío) |
| `docker-compose.yml` | Reemplazar (actualmente vacío) |
| `apps/api-core/.dockerignore` | Crear |

---

## Task 1: Crear `apps/api-core/.dockerignore`

**Files:**
- Create: `apps/api-core/.dockerignore`

**Nota sobre ubicación:** Docker BuildKit busca el `.dockerignore` en el mismo directorio que el Dockerfile cuando se construye con `-f apps/api-core/Dockerfile`. Al estar junto al Dockerfile, el archivo aplica solo a este servicio — correcto para un monorepo donde cada app tendrá su propio `.dockerignore`. Los patrones son relativos al build context (raíz del monorepo).

- [ ] **Step 1: Crear el archivo**

Crear `apps/api-core/.dockerignore`:

```
# Dependencies
**/node_modules

# Build outputs
**/dist
**/dist-bytecode
**/dist-binary
**/.turbo
**/coverage

# Dev artifacts
**/dev.db
**/dev.db-journal
**/*.db
**/*.db-shm
**/*.db-wal

# Secrets
**/.env
**/.env.*
!**/.env.example

# Git / IDE
.git
.gitignore
**/.DS_Store

# Worktrees
.worktrees

# Logs
**/*.log
```

- [ ] **Step 2: Verificar que el archivo se creó correctamente**

```bash
cat apps/api-core/.dockerignore
```

Expected: contenido del archivo sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/.dockerignore
git commit -m "chore(api-core): add .dockerignore for Docker builds"
```

---

## Task 2: Escribir el Dockerfile — stage `deps`

**Files:**
- Modify: `apps/api-core/Dockerfile`

El stage `deps` instala todas las dependencias (dev + prod) incluyendo los bindings nativos (`better-sqlite3`, `sharp`). Es la base compartida para `build` y `dev`.

**Contexto crítico — pnpm workspaces en Docker:**
pnpm lee `pnpm-workspace.yaml` para descubrir todos los packages del workspace. Si algún `package.json` de otro workspace member no existe en el build context, `pnpm install` falla. La solución es copiar los `package.json` de TODOS los workspace members antes de `pnpm install`.

Los workspace members del monorepo son:
- `apps/api-core/package.json`
- `apps/ui/package.json`
- `apps/desktop/package.json`
- `apps/license-server/package.json`

(No hay `package.json` en `packages/build-tools/` — pnpm lo ignora automáticamente.)

- [ ] **Step 1: Escribir el stage `deps` en el Dockerfile**

Reemplazar el contenido de `apps/api-core/Dockerfile`:

```dockerfile
# ============================
# Stage: deps
# ============================
FROM node:24.15.0-trixie-slim AS deps

# Build tools required for native modules: better-sqlite3, sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# Copy workspace manifests first to maximize layer cache.
# All workspace members must be present or pnpm workspace resolution fails.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-core/package.json     ./apps/api-core/
COPY apps/ui/package.json           ./apps/ui/
COPY apps/desktop/package.json      ./apps/desktop/
COPY apps/license-server/package.json ./apps/license-server/

# Install all deps (dev + prod) — shared by build and dev stages
RUN pnpm install --frozen-lockfile

# Allow node user to write to node_modules (needed for prisma generate in dev stage)
RUN chown -R node:node /app
```

- [ ] **Step 2: Build el stage `deps` y verificar**

```bash
docker build --target deps -t api-core:deps -f apps/api-core/Dockerfile .
```

Expected: build exitoso sin errores. Puede tardar 2-5 min la primera vez por descarga de imagen base y compilación de módulos nativos.

- [ ] **Step 3: Verificar que pnpm y node_modules están disponibles**

```bash
docker run --rm api-core:deps pnpm --version
```

Expected: `10.24.0`

```bash
docker run --rm api-core:deps ls apps/api-core/node_modules/.bin/nest
```

Expected: `/app/apps/api-core/node_modules/.bin/nest` (o ruta en root node_modules)

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/Dockerfile
git commit -m "build(api-core): add deps stage to Dockerfile"
```

---

## Task 3: Escribir el stage `build`

**Files:**
- Modify: `apps/api-core/Dockerfile`

El stage `build` compila NestJS, genera el cliente Prisma para PostgreSQL, y ejecuta `pnpm deploy` para crear un directorio `/deploy` con solo las production node_modules.

**Sobre `pnpm deploy`:**
- Crea `/deploy` con prod `node_modules` (sin devDeps)
- No copia ni `dist/` ni el cliente Prisma generado — esos se copian manualmente
- El cliente Prisma generado en `/deploy/node_modules/.prisma/` se crea corriendo `prisma generate` dentro de `/deploy` usando el binario ya instalado en `node_modules/.bin/prisma`

- [ ] **Step 1: Agregar el stage `build` al Dockerfile**

Agregar al final de `apps/api-core/Dockerfile`:

```dockerfile

# ============================
# Stage: build
# ============================
FROM deps AS build

# Copy source files
COPY apps/api-core/src            ./apps/api-core/src
COPY apps/api-core/prisma         ./apps/api-core/prisma
COPY apps/api-core/public         ./apps/api-core/public
COPY apps/api-core/nest-cli.json  ./apps/api-core/nest-cli.json
COPY apps/api-core/tsconfig.json  ./apps/api-core/tsconfig.json
COPY apps/api-core/tsconfig.build.json ./apps/api-core/tsconfig.build.json

# Generate Prisma client for PostgreSQL (prod schema)
WORKDIR /app/apps/api-core
RUN pnpm exec prisma generate --schema=./prisma/schema.postgresql.prisma

# Compile NestJS → dist/
RUN pnpm run build

# Create production deploy: /deploy contains prod node_modules only
WORKDIR /app
RUN pnpm deploy --filter @restaurants/api-core --prod /deploy

# Copy compiled output and assets into the deploy directory
RUN cp -r apps/api-core/dist    /deploy/dist \
    && cp -r apps/api-core/prisma   /deploy/prisma \
    && cp -r apps/api-core/public   /deploy/public

# Generate Prisma client inside /deploy (ensures correct internal paths)
WORKDIR /deploy
RUN node_modules/.bin/prisma generate --schema=./prisma/schema.postgresql.prisma
```

- [ ] **Step 2: Build el stage `build` y verificar**

```bash
docker build --target build -t api-core:build -f apps/api-core/Dockerfile .
```

Expected: build exitoso.

- [ ] **Step 3: Verificar artefactos en `/deploy`**

```bash
docker run --rm api-core:build ls /deploy
```

Expected: `dist  node_modules  package.json  prisma  public`

```bash
docker run --rm api-core:build ls /deploy/dist/src
```

Expected: `main.js` y otros archivos `.js` compilados.

```bash
docker run --rm api-core:build ls /deploy/node_modules/.prisma/client
```

Expected: `libquery_engine-debian-openssl-3.0.x.so.node` (u otro binario linux) y archivos `.js`/`.d.ts` generados.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/Dockerfile
git commit -m "build(api-core): add build stage with pnpm deploy"
```

---

## Task 4: Escribir el stage `dev`

**Files:**
- Modify: `apps/api-core/Dockerfile`

El stage `dev` es para docker-compose en desarrollo. El source code se monta vía volumen — no se copia en la imagen. Al iniciar el contenedor, genera el cliente Prisma (PostgreSQL) y arranca `nest start --watch`.

- [ ] **Step 1: Agregar el stage `dev` al Dockerfile**

Agregar al final de `apps/api-core/Dockerfile`:

```dockerfile

# ============================
# Stage: dev
# ============================
FROM deps AS dev

ENV NODE_ENV=development

WORKDIR /app/apps/api-core

USER node

# Source code is mounted via docker-compose volume at runtime.
# On startup: generate Prisma client, then start with hot reload.
CMD ["sh", "-c", "pnpm exec prisma generate --schema=prisma/schema.postgresql.prisma && pnpm run dev"]
```

- [ ] **Step 2: Build el stage `dev` y verificar**

```bash
docker build --target dev -t api-core:dev -f apps/api-core/Dockerfile .
```

Expected: build exitoso.

- [ ] **Step 3: Verificar usuario y entorno**

```bash
docker run --rm api-core:dev whoami
```

Expected: `node`

```bash
docker run --rm api-core:dev node --version
```

Expected: `v24.15.0`

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/Dockerfile
git commit -m "build(api-core): add dev stage for docker-compose hot reload"
```

---

## Task 5: Escribir el stage `prod`

**Files:**
- Modify: `apps/api-core/Dockerfile`

El stage `prod` parte de una imagen base limpia (`node:24.15.0-trixie-slim`) — no hereda nada del stage `build`. Elimina `npm`/`npx`, corre como usuario `node`, y solo contiene los artefactos de `/deploy`.

- [ ] **Step 1: Agregar el stage `prod` al Dockerfile**

Agregar al final de `apps/api-core/Dockerfile`:

```dockerfile

# ============================
# Stage: prod
# ============================
FROM node:24.15.0-trixie-slim AS prod

# Remove npm/npx — not needed in prod, reduces attack surface
RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm \
    && rm -f /usr/local/bin/npx

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy only the production artifacts from build stage
COPY --from=build --chown=node:node /deploy ./

USER node

EXPOSE 3000

CMD ["node", "dist/src/main"]
```

- [ ] **Step 2: Build la imagen `prod` y verificar**

```bash
docker build --target prod -t api-core:prod -f apps/api-core/Dockerfile .
```

Expected: build exitoso.

- [ ] **Step 3: Verificar hardening — npm eliminado**

```bash
docker run --rm api-core:prod npm --version
```

Expected: `OCI runtime exec failed` o `npm: not found` — npm no debe existir.

- [ ] **Step 4: Verificar usuario no-root**

```bash
docker run --rm api-core:prod whoami
```

Expected: `node`

- [ ] **Step 5: Verificar que no hay build tools**

```bash
docker run --rm api-core:prod which python3 2>&1 || echo "not found"
```

Expected: `not found`

- [ ] **Step 6: Verificar tamaño de la imagen prod vs deps**

```bash
docker images | grep api-core
```

Anotar el tamaño: `prod` debe ser significativamente más pequeño que `deps` (que tiene build tools + devDeps).

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/Dockerfile
git commit -m "build(api-core): add hardened prod stage"
```

---

## Task 6: Crear `docker-compose.yml` y probar el flujo completo

**Files:**
- Modify: `docker-compose.yml`

El `docker-compose.yml` orquesta dos servicios: `api` (stage `dev` del Dockerfile) y `postgres`. El servicio `api` espera a que postgres esté healthy antes de arrancar.

**Prerequisito — actualizar `DATABASE_URL` en `apps/api-core/.env`:**
El `DATABASE_URL` debe apuntar al servicio `postgres` del compose. El hostname es el nombre del servicio (`postgres`).

- [ ] **Step 1: Actualizar `DATABASE_URL` en `apps/api-core/.env`**

Abrir `apps/api-core/.env` y asegurarse de que exista esta línea (agregar o reemplazar la existente):

```
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/restaurants
```

**Nota:** `postgres` como hostname funciona solo dentro de la red Docker del compose. Para desarrollo local sin Docker, mantén el valor original en un comentario o usa un `.env.local`.

- [ ] **Step 2: Escribir el `docker-compose.yml`**

Reemplazar el contenido de `docker-compose.yml` en la raíz:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: apps/api-core/Dockerfile
      target: dev
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./apps/api-core/src:/app/apps/api-core/src
      - ./apps/api-core/prisma:/app/apps/api-core/prisma
    env_file:
      - ./apps/api-core/.env
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-restaurants}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

- [ ] **Step 3: Levantar los servicios**

```bash
docker compose up --build
```

Expected en los logs:
1. `postgres` arranca y el healthcheck pasa: `database system is ready to accept connections`
2. `api` genera el cliente Prisma: `Prisma schema loaded from prisma/schema.postgresql.prisma`
3. `api` compila y arranca NestJS: `Nest application successfully started`

- [ ] **Step 4: Verificar que la API responde**

En otra terminal:

```bash
curl -s http://localhost:3000/v1/ | head -c 200
```

Expected: respuesta JSON del API (puede ser 404 si no hay ruta raíz, pero debe responder — no connection refused).

- [ ] **Step 5: Verificar hot reload**

Con los servicios corriendo, editar cualquier archivo en `apps/api-core/src/` (por ejemplo agregar un comentario en `app.module.ts`). En los logs del compose debe aparecer:

```
[Nest] X  - File change detected. Starting incremental compilation...
[Nest] X  - Compilation complete.
```

- [ ] **Step 6: Detener servicios**

```bash
docker compose down
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml apps/api-core/.env
git commit -m "build: add docker-compose for api-core dev environment"
```

**Nota:** Si `.env` está en `.gitignore`, hacer commit solo de `docker-compose.yml` y documentar la variable requerida en el README o en un `.env.example`.

---

## Self-Review

### Spec coverage check

| Requisito del spec | Task que lo implementa |
|---|---|
| Multi-stage: deps, build, dev, prod | Tasks 2–5 |
| Base image `node:24.15.0-trixie-slim` | Task 2 (`deps`), Task 5 (`prod` imagen limpia) |
| No npm/npx/pnpm en prod | Task 5 Step 1 |
| Usuario no-root en prod y dev | Task 4 Step 1 (`USER node`), Task 5 Step 1 (`USER node`) |
| pnpm deploy para prod node_modules | Task 3 Step 1 |
| prisma generate con schema PostgreSQL | Task 3 Step 1 (build), Task 4 Step 1 (dev CMD) |
| Dev con hot reload via volumen | Task 4 + Task 6 |
| docker-compose con postgres healthcheck | Task 6 Step 2 |
| .dockerignore con exclusión de secrets | Task 1 |
| Build tools solo en deps/build, no en prod | Task 5 (FROM limpio) |
| DATABASE_URL apunta a servicio postgres en Docker | Task 6 Step 1 |

### Decisiones documentadas

- **`chown -R node:node /app` en `deps`:** necesario para que el `USER node` del stage `dev` pueda escribir el cliente Prisma generado en `node_modules/.prisma/client/` durante el CMD del contenedor.
- **`pnpm deploy` con `--filter`:** único lugar donde `--filter` es necesario porque `pnpm deploy` se ejecuta desde la raíz del workspace.
- **`prisma generate` en `/deploy` (no copiado desde build):** evita problemas de paths internos del cliente Prisma al copiar entre directorios.
- **Todos los `apps/*/package.json` copiados en `deps`:** pnpm falla si algún workspace member declarado en `pnpm-workspace.yaml` no tiene `package.json`.
