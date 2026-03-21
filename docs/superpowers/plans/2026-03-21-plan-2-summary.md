# Plan 2 — License Server: Resumen Completo

**Date:** 2026-03-21
**Branch:** `develop`
**Status:** Completo

---

## Objetivo

`apps/license-server` — API NestJS mínima desplegada en Railway que:
- Genera llaves de licencia (`XXXX-XXXX-XXXX-XXXX`)
- Valida activaciones con hardware binding (`machineId`)
- Emite JWTs firmados con RSA-256 para verificación offline en el desktop

---

## Arquitectura

```
Cliente (Electron)          License Server (Railway)
       │                           │
       │  POST /licenses/activate  │
       │  { licenseKey, machineId, │
       │    platform }  ──────────►│  verifica llave + machineId
       │                           │  registra activación en PostgreSQL
       │◄── { token: JWT RS256 } ──│  firma con RSA private key
       │                           │
       │  (sin internet requerido) │
       │  jwt.verify(token,        │
       │    RSA_PUBLIC_KEY)        │  ← public.pem embebida en el binario
```

---

## Endpoints

| Method | Path | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/licenses/generate` | `x-admin-key` | Genera nueva llave |
| POST | `/licenses/activate` | Ninguna | Activa llave + bind machineId |
| POST | `/licenses/deactivate` | `x-admin-key` | Libera machine slot |
| GET | `/licenses/:key/status` | `x-admin-key` | Consulta estado de llave |

---

## Archivos creados

```
apps/license-server/
├── package.json                          NestJS 11, @nestjs/jwt, Prisma 6, Swagger
├── tsconfig.json
├── nest-cli.json
├── .gitignore                            excluye .env, dev.db, keys/, dist/
├── .env.example                          template para Railway
├── Dockerfile                            multi-stage, build desde repo root
├── railway.toml                          dockerfilePath + restartPolicyType
├── prisma/
│   ├── schema.prisma                     SQLite local / PostgreSQL en prod (patch en Dockerfile)
│   └── migrations/20260320133740_init/   migración inicial (tabla License)
├── keys/
│   └── private.pem                       (gitignoreada) llave RSA privada
└── src/
    ├── config.ts                         PORT, ADMIN_API_KEY, RSA_PRIVATE_KEY (env o archivo)
    ├── main.ts                           bootstrap: ValidationPipe + Swagger en /docs
    ├── app.module.ts
    ├── admin.guard.ts                    valida header x-admin-key
    ├── prisma.service.ts                 PrismaService con OnModuleInit/OnModuleDestroy
    └── licenses/
        ├── dto/
        │   ├── generate-license.dto.ts
        │   ├── activate-license.dto.ts
        │   └── deactivate-license.dto.ts
        ├── licenses.service.ts           lógica: generate, activate, deactivate, getStatus
        ├── licenses.service.spec.ts      6 tests unitarios
        ├── licenses.controller.ts        4 endpoints HTTP
        └── licenses.module.ts
```

---

## Detalles de implementación

### Generación de llaves
`randomBytes(2).toString('hex').toUpperCase()` × 4 segmentos → `ABCD-1234-EFGH-5678`

### Firma JWT
- Algoritmo: **RS256** (asimétrico)
- Llave privada: solo en el servidor
- Llave pública: `apps/desktop/resources/public.pem` (commiteada, embebida en binario Electron)
- Expiración: 100 años (verificación offline permanente)
- Payload: `{ licenseKey, machineId, platform, activatedAt }`

### AdminGuard (seguridad)
- Rechaza si `ADMIN_API_KEY` no está configurada (evita que un deploy sin env var quede abierto)
- Rechaza si header `x-admin-key` está ausente o no coincide

### PrismaService
Extiende `PrismaClient` con `OnModuleInit` (`$connect`) y `OnModuleDestroy` (`$disconnect`) para no agotar conexiones PostgreSQL en Railway bajo reinicios.

### Dockerfile
```dockerfile
# Build desde raíz del repo
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
# Instala solo deps de license-server con --frozen-lockfile
# Parchea schema.prisma: sqlite → postgresql + verifica con grep
# Genera Prisma client PostgreSQL, compila TypeScript

FROM node:22-alpine
# Solo dist/, node_modules/, prisma/
ENV NODE_ENV=production
USER node  # corre sin root
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main"]
```

### Configuración Railway

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | URL PostgreSQL de Railway |
| `ADMIN_API_KEY` | String secreto (guardar en spreadsheet) |
| `RSA_PRIVATE_KEY` | Contenido de `private.pem` con `\n` escapados |
| `PORT` | 3001 (opcional, Railway lo inyecta) |

**Root Directory:** `/`
**Dockerfile Path:** `apps/license-server/Dockerfile`

---

## Tests

```bash
cd apps/license-server && pnpm test
# 6 tests, todos pasan
```

---

## Smoke test local

```bash
cd apps/license-server
pnpm prisma:migrate   # crea dev.db
pnpm start:dev        # levanta en :3001

# Generar llave
curl -X POST http://localhost:3001/licenses/generate \
  -H "x-admin-key: dev-admin-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"mode":"desktop"}'

# Activar (sustituir KEY por la llave generada)
curl -X POST http://localhost:3001/licenses/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"KEY","machineId":"test-machine","platform":"darwin"}'
```

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
| `95018ee` | feat(license-server): add Dockerfile and railway.toml for Railway deployment |
| `2cba4bd` | fix(license-server): harden Dockerfile (sed guard, pin pnpm, USER node, NODE_ENV) |
| `c44558c` | fix(license-server): use local binaries in Dockerfile builder stage |
| `633121f` | fix(license-server): fix AdminGuard security bug, add PrismaService lifecycle, fix activatedAt timestamp |

---

## Pendiente

- **Deploy a Railway** (manual): crear proyecto, PostgreSQL, configurar env vars
- **Plan 3:** `apps/desktop` — Electron app completa
