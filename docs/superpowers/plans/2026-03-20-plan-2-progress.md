# Plan 2 — License Server: Progreso

**Date:** 2026-03-20
**Branch:** `develop`
**Status:** En progreso (Tasks 1-6 completas, Task 7 pendiente)

---

## Objetivo

Construir `apps/license-server` — una API NestJS mínima que genera llaves de licencia, valida activaciones con hardware binding, y emite JWTs firmados con RSA para verificación offline en el desktop.

---

## Cambios por tarea

### Task 1: Scaffold `apps/license-server`

- Estructura de directorios creada: `src/licenses/dto/`, `prisma/`
- `package.json` con NestJS 11, `@nestjs/jwt`, `@nestjs/swagger`, Prisma 6
- `tsconfig.json` y `nest-cli.json`
- Dependencias instaladas vía pnpm workspace

### Task 2: RSA Key Pair

- Par de llaves RSA-2048 generado con `openssl`
- Llave privada: `apps/license-server/keys/private.pem` (gitignoreada)
- Llave pública: `apps/desktop/resources/public.pem` (commiteada — embebida en el binario Electron)
- Root `.gitignore` actualizado con `apps/license-server/keys/`
- `apps/license-server/.gitignore` creado (`.env`, `dev.db`, `keys/`, `dist/`)

### Task 3: Prisma schema + migración

- `prisma/schema.prisma` con modelo `License`:
  - `key` (PK), `machineId`, `platform`, `mode`, `activatedAt`, `status`, `createdAt`
  - Provider SQLite para desarrollo local, PostgreSQL en producción (Railway)
- `.env` local (gitignoreado) con `DATABASE_URL=file:./dev.db`
- `.env.example` commiteado con template para PostgreSQL
- Migración inicial generada: `prisma/migrations/20260320133740_init/`

### Task 4: Config y bootstrap

- `src/config.ts` — exporta: `PORT`, `DATABASE_URL`, `ADMIN_API_KEY`, `JWT_ISSUER`, `RSA_PRIVATE_KEY`
  - Soporta RSA key desde env var (Railway) o desde archivo (desarrollo local)
  - Maneja el flatten de newlines que hace Railway (`\\n` → `\n`)
- `src/main.ts` — bootstrap con `ValidationPipe`, Swagger en `/docs`, escucha en `PORT`

### Task 5: LicensesService y DTOs (TDD)

DTOs creados:
- `GenerateLicenseDto` — campo `mode` opcional (`desktop` | `cloud`)
- `ActivateLicenseDto` — `licenseKey`, `machineId`, `platform`
- `DeactivateLicenseDto` — `licenseKey`

`LicensesService` implementado con:
- `generate()` — genera llave `XXXX-XXXX-XXXX-XXXX` con `randomBytes`
- `activate()` — verifica existencia, estado y machineId; emite JWT RS256 con expiración 100 años
- `deactivate()` — libera el machine slot (reset a `available`)
- `getStatus()` — retorna estado de una llave

6 tests unitarios, todos pasan.

### Task 6: LicensesController, AdminGuard, AppModule

- `AdminGuard` — valida header `x-admin-key` contra `ADMIN_API_KEY`
- `LicensesController` con 4 endpoints:

| Method | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/licenses/generate` | AdminGuard | Genera nueva llave |
| POST | `/licenses/activate` | Ninguna | Activa llave + bind hardware |
| POST | `/licenses/deactivate` | AdminGuard | Libera machine slot |
| GET | `/licenses/:key/status` | AdminGuard | Consulta estado |

- `LicensesModule` — provee `PrismaClient` y `JwtModule`
- `AppModule` — importa `LicensesModule`
- Build TypeScript: sin errores
- Smoke test local: generate + activate retornan respuestas correctas con JWT RS256

---

## Pendiente

### Task 7: Dockerfile + config Railway

- `Dockerfile` multi-stage para deploy en Railway
- `config.ts` ya soporta `RSA_PRIVATE_KEY` desde env var (implementado en Task 4)
- Deploy a Railway: crear proyecto, agregar PostgreSQL, configurar env vars

---

## Commits

| Hash | Descripción |
|------|-------------|
| `be22ab2` | feat(license-server): scaffold NestJS app |
| `620fcb0` | feat(license-server): add RSA public key for desktop license verification |
| `4217323` | feat(license-server): add Prisma schema and initial migration |
| `87c7efe` | feat(license-server): add config and main bootstrap |
| `74f7d9f` | feat(license-server): add LicensesService with generate, activate, deactivate, status |
| `7b77f7f` | feat(license-server): add LicensesController, AdminGuard, and AppModule |

---

## Próximos pasos

1. **Task 7** — Dockerfile + deploy a Railway
2. **Plan 3** — `apps/desktop` Electron app (trial, verificación offline RSA, system tray, spawner NestJS)
