# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Turborepo monorepo (pnpm workspaces) with two apps:
- **`apps/api-core`** — NestJS REST API + WebSocket, Prisma ORM, PostgreSQL
- **`apps/restaurant-ui`** — Astro + Tailwind CSS frontend

Two products: a **kiosk interface** for customers to order (accessed via restaurant slug URL) and a **management dashboard** for restaurant owners/staff.

## Commands

### Root (runs both apps via Turborepo)
```bash
pnpm dev        # start all apps in watch mode
pnpm build      # build all apps
pnpm lint       # lint all apps
```

### api-core (run from `apps/api-core/`)
```bash
pnpm run dev             # start in watch mode
pnpm test                # run unit tests
pnpm test:watch          # run tests in watch mode
pnpm test:cov            # run with coverage
pnpm test:e2e            # run e2e tests
pnpm run cli <command>   # run CLI management tool (see below)
```

### Prisma (run from `apps/api-core/`)
```bash
pnpm exec prisma migrate dev --name <migration_name>  # create and apply migration
pnpm exec prisma generate                              # regenerate Prisma client after schema changes
pnpm exec prisma studio                                # open database browser UI
```

### CLI management tool
```bash
pnpm run cli create-dummy                                             # seed demo restaurant + admin + products
pnpm run cli create-restaurant --name <name>                          # create restaurant, prints id/name/slug
pnpm run cli create-admin -e <email> -p <password> --restaurant-id <id>
```

### restaurant-ui (run from `apps/restaurant-ui/`)
```bash
pnpm dev      # dev server at localhost:4321
pnpm build    # production build to ./dist/
pnpm preview  # preview production build
```

## API Architecture

All routes are prefixed with `/v1/`. Key modules in `apps/api-core/src/`:

| Module | Purpose |
|--------|---------|
| `auth` | JWT login/refresh/logout, access + refresh token pair |
| `restaurants` | Restaurant CRUD |
| `products` | Product catalog (scoped to restaurantId) |
| `menus` | Menu management (time/day restricted menus) |
| `orders` | Order lifecycle (CREATED → PROCESSING → PAID → COMPLETED) |
| `register` | Cash register sessions (OPEN/CLOSED) |
| `kiosk` | Public-facing kiosk endpoints (unauthenticated) |
| `onboarding` | AI-assisted product creation from photos (Gemini API) |
| `users` | Staff user management with email activation |
| `events` | WebSocket gateway (socket.io) for real-time updates |
| `print` | Print/receipt functionality |
| `common` | Shared DTOs, guards, interfaces |

### Auth & Authorization

- `JwtAuthGuard` — validates JWT access token; applied globally
- `RolesGuard` — enforces role-based access; ADMIN bypasses all role checks
- `@Public()` decorator — marks routes as unauthenticated (kiosk endpoints)
- `@Roles(Role.MANAGER)` decorator — restricts route to specific roles
- Roles: `ADMIN > MANAGER > BASIC`
- All non-kiosk, non-auth endpoints require a valid JWT

### Data Model

Everything is scoped to a `restaurantId`. Key relationships:
- `Restaurant` → `User`, `Product`, `Menu`, `Category`, `Order`, `RegisterSession`
- `Menu` ←→ `Product` via `MenuItem` (pivot with optional price/stock overrides)
- `Order` → `OrderItem` → `Product` (optionally via `MenuItem`)
- `RegisterSession` contains `Order`s; tracks sequential `orderNumber`

See `apps/api-core/docs/database_schema.md` for full schema and nullable field rationale.

## Frontend Architecture

Astro pages in `apps/restaurant-ui/src/pages/`:
- `/kiosk/[slug].astro` — customer-facing ordering interface
- `/dash/*` — management dashboard (login-gated)
- `/login.astro`, `/activate.astro`, `/onboarding.astro`

`src/lib/` utilities:
- `api.ts` — central `apiFetch()` wrapper with automatic JWT refresh on 401 and redirect to `/login` on auth failure; uses `PUBLIC_API_URL` env var
- `auth.ts` — localStorage token read/write helpers
- `kiosk-api.ts` — unauthenticated kiosk API calls
- `pagination.ts` — shared pagination helpers

## Environment Variables

Required for `apps/api-core`:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — signing secret for JWT tokens

Optional but commonly needed:
- `GEMINI_API_KEY` + `GEMINI_MODEL` — for AI photo-to-products onboarding
- `RESEND_API_KEY` + `EMAIL_FROM` — for user activation emails
- `FRONTEND_URL` — defaults to `http://localhost:4321`
- `PORT` — API port, defaults to `3000`

For `apps/restaurant-ui`:
- `PUBLIC_API_URL` — API base URL, defaults to `http://localhost:3000`

Full reference: `apps/api-core/docs/environments.md`

## Skills

- `nestjs-best-practices` — use when writing/reviewing API code
- `web-design-guidelines` — use when writing/reviewing frontend UI code
