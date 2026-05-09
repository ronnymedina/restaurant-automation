# AGENTS.md

## Architecture

- **Turborepo monorepo** with pnpm (packageManager: pnpm@10.24.0)
- `apps/api-core` — NestJS + Prisma + PostgreSQL
- `apps/ui` — Astro (static output) + React + Tailwind CSS

## Dev Setup

```bash
# Full stack (Docker — preferred)
docker compose up

# Backend only
docker compose up res-api-core res-db

# Frontend only
docker compose up res-ui
```

## Key Commands

### api-core (run from `apps/api-core/` or via Docker)
```bash
pnpm run dev          # watch mode (without Docker)
pnpm run lint         # eslint + prettier --fix
pnpm test             # unit tests (Jest)
pnpm test:e2e         # e2e tests
pnpm test:cov         # coverage
pnpm run cli <cmd>    # CLI management tool
pnpm exec prisma migrate dev --name <name> --schema=./prisma/schema.postgresql.prisma
pnpm exec prisma generate --schema=./prisma/schema.postgresql.prisma
pnpm exec prisma studio --schema=./prisma/schema.postgresql.prisma
```

**Tests must run inside Docker:** `docker compose exec res-api-core pnpm test`

### ui (run from `apps/ui/`)
```bash
pnpm dev      # dev server at localhost:4321
pnpm build    # production build to ./dist/
pnpm preview  # preview production build
pnpm test     # vitest (unit tests)
```

## Important Conventions

- **Kiosk URL routing**: uses query param (`/kiosk?slug=mi-restaurante`) not path segments. The Astro output is static HTML served by nginx — dynamic paths don't work reliably.
- **Prisma schema file**: `apps/api-core/prisma/schema.postgresql.prisma` (NOT `schema.prisma`)
- **Auth**: JWT access + refresh token pair. `JwtAuthGuard` applied globally; `@Public()` decorator marks unauthenticated routes (kiosk endpoints).
- **Roles**: ADMIN > MANAGER > BASIC. ADMIN bypasses all role checks.
- **All API routes prefixed** with `/v1/`. Swagger UI at `/docs` in development.
- **Everything scoped to** `restaurantId`.
- **SSE real-time**: events module uses Server-Sent Events (not WebSocket), scoped to `restaurantId`.
- **UI build**: `PUBLIC_API_URL` is baked into the static bundle at build time.

## Environment Files

```
apps/api-core/.env    # DATABASE_URL, JWT_SECRET, PORT, etc.
apps/ui/.env          # PUBLIC_API_URL
```

## Skills

- `nestjs-best-practices` — use when writing/reviewing API code
- `web-design-guidelines` — use when writing/reviewing frontend UI code

## Documentation

Each app maintains its own `docs/` folder. Docs go inside the corresponding `apps/*/docs/` — not at repo root unless explicitly requested.
