# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Restaurant automation platform with two independently deployed apps:
- **`apps/api-core`** — NestJS REST API + SSE, Prisma ORM, PostgreSQL
- **`apps/ui`** — Astro + Tailwind CSS frontend (kiosk + management dashboard)

Two products: a **kiosk** for customers to order and a **dashboard** for restaurant owners/staff.

License server (`apps/license-server`) and Electron desktop app (`apps/desktop`) are planned but not yet active — the platform launched as a cloud-only SaaS first.

### Kiosk URL routing
The kiosk uses a **query param** (`/kiosk?slug=mi-restaurante`) not path segments. Astro is compiled as static HTML served by nginx; dynamic path segments don't work reliably in that context, so the slug goes via query string instead.

## Commands

### Local development (Docker — preferred)
```bash
# From repo root
docker compose up                    # all services (api, ui, postgres)
docker compose up res-api-core res-db  # backend only
docker compose up res-ui             # frontend only
```
`src/` and `prisma/` are mounted as volumes — changes reload without rebuilding.

### api-core (run from `apps/api-core/`)
```bash
pnpm run dev             # watch mode (without Docker)
pnpm test                # unit tests
pnpm test:watch          # unit tests in watch mode
pnpm test:cov            # coverage
pnpm test:e2e            # e2e tests
pnpm run cli <command>   # CLI management tool
```

> **IMPORTANTE:** Los tests siempre deben ejecutarse **dentro del contenedor Docker**, no en local:
> ```bash
> docker compose exec res-api-core pnpm test
> docker compose exec res-api-core pnpm test:cov
> docker compose exec res-api-core pnpm test:e2e
> ```

### Prisma (run from `apps/api-core/`)
```bash
pnpm exec prisma migrate dev --name <migration_name>   # create and apply migration
pnpm exec prisma generate                               # regenerate Prisma client
pnpm exec prisma studio                                 # database browser UI
```
Schema file: `prisma/schema.postgresql.prisma`

### CLI management tool
```bash
pnpm run cli create-dummy                                              # seed demo restaurant + admin + products
pnpm run cli create-restaurant --name <name>                           # create restaurant
pnpm run cli create-admin -e <email> -p <password> --restaurant-id <id>
```

### ui (run from `apps/ui/`)
```bash
pnpm dev      # dev server at localhost:4321 (without Docker)
pnpm build    # production build to ./dist/
pnpm preview  # preview production build
```

## API Architecture

All routes are prefixed with `/v1/`. Swagger UI available at `/docs` in development. Key modules in `apps/api-core/src/`:

| Module | Purpose |
|--------|---------|
| `auth` | JWT login/refresh/logout, access + refresh token pair |
| `restaurants` | Restaurant CRUD |
| `products` | Product catalog (scoped to restaurantId) |
| `menus` | Menu management (time/day restricted menus) |
| `orders` | Order lifecycle (CREATED → PROCESSING → COMPLETED → CANCELLED) |
| `cash-register` | Cash shift sessions (OPEN/CLOSED), tracks sequential orderNumber |
| `kiosk` | Public-facing kiosk endpoints (unauthenticated) |
| `kitchen` | Kitchen display — order queue for kitchen staff |
| `onboarding` | AI-assisted product creation from photos (Gemini API) |
| `users` | Staff user management with email activation |
| `events` | SSE gateway (Server-Sent Events) for real-time order/catalog updates |
| `print` | Print/receipt functionality |
| `uploads` | File upload handling |
| `common` | Shared DTOs, guards, interfaces |

### Auth & Authorization

- `JwtAuthGuard` — validates JWT access token; applied globally
- `RolesGuard` — enforces role-based access; ADMIN bypasses all role checks
- `@Public()` decorator — marks routes as unauthenticated (kiosk endpoints)
- `@Roles(Role.MANAGER)` decorator — restricts route to specific roles
- Roles: `ADMIN > MANAGER > BASIC`

### Data Model

Everything is scoped to a `restaurantId`. Key relationships:
- `Restaurant` → `User`, `Product`, `Menu`, `Category`, `Order`, `CashShift`
- `Menu` ←→ `Product` via `MenuItem` (pivot; price/stock always come from `Product` — per-menu overrides were removed)
- `Order` → `OrderItem` → `Product` (optionally via `MenuItem`)
- `CashShift` contains `Order`s; tracks sequential `orderNumber`

See `apps/api-core/docs/database_schema.md` for full schema and nullable field rationale.

### Real-time (SSE)

The `events` module uses Server-Sent Events (not WebSocket). `SseService` holds two RxJS Subjects: `restaurant$` (orders, catalog) and `kitchen$`. Clients connect via EventSource; events are scoped to `restaurantId`. Frontend constants in `apps/ui/src/lib/sse-events.ts`.

## Frontend Architecture

Pages in `apps/ui/src/pages/`:
- `/kiosk/index.astro` — customer-facing ordering interface (`?slug=` query param)
- `/kitchen/index.astro` — kitchen display
- `/dash/index.astro` — dashboard home
- `/dash/orders.astro`, `/dash/orders-history.astro`
- `/dash/register.astro`, `/dash/register-history.astro`
- `/dash/products.astro`, `/dash/categories.astro`
- `/dash/menus.astro`, `/dash/menus/detail.astro`
- `/dash/users.astro`, `/dash/tables.astro`, `/dash/reservations.astro`, `/dash/settings.astro`, `/dash/kitchen.astro`
- `/login.astro`, `/activate.astro`, `/onboarding.astro`, `/confirm-operation.astro`

`src/lib/` utilities:
- `api.ts` — central `apiFetch()` wrapper; auto JWT refresh on 401, redirects to `/login` on auth failure
- `auth.ts` — localStorage token read/write helpers
- `kiosk-api.ts` — unauthenticated kiosk API calls
- `sse-events.ts` — SSE event name constants (ORDER_EVENTS, CATALOG_EVENTS)
- `menus-api.ts`, `products-api.ts` — typed API wrappers for specific resources
- `pagination.ts` — shared pagination helpers

## Environment Variables

Required for `apps/api-core` (see `apps/api-core/docs/environments.md` for full reference):
- `NODE_ENV`, `DATABASE_URL`, `PORT`, `JWT_SECRET`
- `JWT_ACCESS_EXPIRATION` (e.g. `15m`), `JWT_REFRESH_EXPIRATION` (e.g. `7d`)
- `BCRYPT_SALT_ROUNDS`

Optional:
- `GEMINI_API_KEY` + `GEMINI_MODEL` — AI photo-to-products onboarding
- `RESEND_API_KEY` + `EMAIL_FROM` — user activation emails
- `FRONTEND_URL` — defaults to `http://localhost:4321`
- `API_BASE_URL` — used in presigned URLs, defaults to `http://localhost:3000`

For `apps/ui`:
- `PUBLIC_API_URL` — API base URL; baked into the static bundle at build time (see `apps/ui/README.md` for the Railway placeholder injection mechanism)

## Docker

Both apps use multi-stage Dockerfiles. `docker-compose.yml` at root uses the `dev` stage; Railway deploys use the `prod` stage.

| Stage | api-core | ui |
|-------|----------|----|
| `dev` | NestJS hot reload | Astro dev server |
| `prod` | node-slim, runs `node dist/src/main` | nginx + entrypoint injects `PUBLIC_API_URL` |

## Convenciones del backend

- **Sin `any`**: prohibido en todo el proyecto (ESLint `@typescript-eslint/no-explicit-any: error`). Cuando el tipo no se conozca, usar `unknown` + narrowing — nunca `any`.
- **Errores documentados**: toda excepción lleva un comentario en su definición y un `@ApiResponse` en Swagger con su `code`. El contrato de error sigue el **[ADR 0007](apps/api-core/docs/adr/0007-contrato-de-error-unificado.md)**: `{ message: string[], code, statusCode, details? }`. Los mensajes técnicos van en inglés; el texto friendly (ES) vive en el frontend (`apps/ui/src/lib/error-messages.ts`), mapeado por `code`. Catálogo de códigos en `apps/api-core/docs/onboarding-error-mapping.md`.

## Documentation Convention

Each app maintains its own `docs/` folder with a `README.md` index:

```
apps/api-core/docs/    # api-core documentation
apps/ui/docs/          # ui documentation
```

Rules:
- All documentation goes inside the `docs/` of the corresponding app — never at the repo root unless the user explicitly requests it.
- Each `docs/` has a `README.md` that lists all files in that folder.
- Global (cross-app) documentation is only created when the user explicitly asks for it.

## Skills

- `nestjs-best-practices` — use when writing/reviewing API code
- `web-design-guidelines` — use when writing/reviewing frontend UI code
