# Dockerfile Design — apps/api-core

**Date:** 2026-05-01  
**Scope:** `apps/api-core/Dockerfile`, `docker-compose.yml` (raíz), `.dockerignore` (raíz)

---

## Contexto

Monorepo pnpm workspaces (Turborepo). El servicio `api-core` es una app NestJS con:
- Deps con bindings nativos: `better-sqlite3`, `sharp`
- Dos schemas Prisma: `schema.prisma` (SQLite, dev) y `schema.postgresql.prisma` (PostgreSQL, prod/cloud)
- Script de producción: `node dist/src/main`
- Script de desarrollo: `nest start --watch`
- pnpm versión `10.24.0`

---

## Decisiones clave

| Decisión | Elección | Razón |
|---|---|---|
| Base image | `node:24.15.0-trixie-slim` (Debian 13 stable) | Versión exacta solicitada, slim para menor superficie |
| Gestión de deps monorepo | `pnpm deploy --filter @restaurants/api-core --prod /deploy` | Produce node_modules de prod sin devDeps, idiomático para pnpm workspaces |
| Dev database (Docker) | PostgreSQL (via docker-compose) | SQLite solo se usa en local sin Docker; Docker dev usa PostgreSQL igual que prod |
| Prod database | PostgreSQL externo | Solo se genera cliente PostgreSQL en build |
| Usuario runtime | `node` (uid 1000, pre-incluido en imágenes oficiales) | Principio de mínimos privilegios |
| npm/npx en prod | Eliminados explícitamente | Superficie de ataque reducida, no son necesarios |

---

## Stages

### `deps` (FROM `node:24.15.0-trixie-slim`)

Instala todas las dependencias (dev + prod). Esta capa se cachea y es compartida por `build` y `dev`.

- Instala herramientas del sistema: `python3 make g++` (necesarias para compilar bindings nativos de `better-sqlite3` y `sharp`)
- Activa pnpm: `corepack enable && corepack prepare pnpm@10.24.0 --activate`
- Copia archivos de workspace para maximizar cache de capas:
  - `/package.json`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml`
  - `apps/api-core/package.json`
- `pnpm install --frozen-lockfile`
- `WORKDIR /app`

### `build` (FROM `deps`)

Compila la aplicación y produce el artefacto de producción.

- Copia source completo de `apps/api-core/`: `src/`, `prisma/`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`
- `WORKDIR /app/apps/api-core` — los comandos de compilación corren directo desde el paquete, sin `--filter`
- Genera cliente Prisma para PostgreSQL:
  ```
  pnpm exec prisma generate --schema=./prisma/schema.postgresql.prisma
  ```
- Compila NestJS: `pnpm run build` → output en `dist/`
- Vuelve a raíz del workspace para deploy:
  ```
  WORKDIR /app
  pnpm deploy --filter @restaurants/api-core --prod /deploy
  ```
  (`pnpm deploy` requiere correr desde la raíz del workspace — único uso de `--filter`)
- Copia al directorio de deploy:
  - `apps/api-core/dist/` → `/deploy/dist/`
  - `apps/api-core/node_modules/.prisma/` → `/deploy/node_modules/.prisma/` (cliente generado)
  - `apps/api-core/prisma/` → `/deploy/prisma/` (schemas, para prisma migrate en runtime)

### `dev` (FROM `deps`)

Stage para desarrollo con hot reload via docker-compose.

- `ENV NODE_ENV=development`
- `WORKDIR /app/apps/api-core`
- `USER node`
- Source code montado via volumen — no se copia en la imagen
- `CMD`: `sh -c "pnpm exec prisma generate --schema=prisma/schema.postgresql.prisma && pnpm run dev"`
  - Genera cliente PostgreSQL al iniciar (mismo schema que prod)
  - Luego arranca `nest start --watch`
- **Nota:** SQLite solo se usa en desarrollo local sin Docker. Docker dev siempre usa PostgreSQL via docker-compose.

### `prod` (FROM `node:24.15.0-trixie-slim` — imagen limpia)

Imagen final hardened. No hereda capas de build ni herramientas de compilación.

- Elimina npm/npx:
  ```
  rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx
  ```
- `USER node`
- `WORKDIR /app`
- `COPY --from=build --chown=node:node /deploy ./`
- `ENV NODE_ENV=production PORT=3000`
- `EXPOSE 3000`
- `CMD ["node", "dist/src/main"]`

**Lo que NO tiene la imagen prod:**
- pnpm, npm, npx, corepack
- NestJS CLI (`@nestjs/cli`)
- TypeScript, ts-node
- Herramientas de compilación (python3, make, g++)
- Archivos fuente `.ts`
- devDependencies

---

## docker-compose.yml (raíz del monorepo)

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

**Nota:** Las credenciales de PostgreSQL deben definirse en un `.env` en la raíz del monorepo (no commitear). El `.env` de `api-core` debe apuntar a este postgres: `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/restaurants`.

---

## .dockerignore (raíz del monorepo)

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

---

## Seguridad — resumen

| Medida | Stage |
|---|---|
| Usuario no-root (`node`, uid 1000) | dev, prod |
| npm/npx eliminados | prod |
| Sin herramientas de compilación | prod (imagen limpia) |
| Sin archivos fuente `.ts` | prod |
| Secrets vía env en runtime, nunca en imagen | todos |
| `.dockerignore` previene inclusión accidental de secrets | build context |
| Multi-stage evita filtración de artefactos de build | prod |

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `apps/api-core/Dockerfile` | Reemplazar (actualmente vacío) |
| `docker-compose.yml` | Crear (actualmente vacío) |
| `.dockerignore` | Crear (no existe) |
