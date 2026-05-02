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

# ============================
# Stage: build
# ============================
FROM deps AS build

# Copy source files
COPY apps/api-core/src            ./apps/api-core/src
COPY apps/api-core/prisma         ./apps/api-core/prisma
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
RUN pnpm deploy --filter @restaurants/api-core --prod --legacy /deploy

# Copy compiled output and assets into the deploy directory
RUN cp -r apps/api-core/dist    /deploy/dist \
    && cp -r apps/api-core/prisma   /deploy/prisma \
    && mkdir -p /deploy/public

# Generate Prisma client inside /deploy (ensures correct internal paths)
WORKDIR /deploy
RUN /app/node_modules/.pnpm/node_modules/.bin/prisma generate --schema=./prisma/schema.postgresql.prisma

# ============================
# Stage: dev
# ============================
FROM deps AS dev

ENV NODE_ENV=development

WORKDIR /app/apps/api-core

# Copy config files needed by nest start --watch at runtime.
# Source (src/) and schema (prisma/) are mounted via docker-compose volumes.
COPY --chown=node:node apps/api-core/tsconfig.json         ./tsconfig.json
COPY --chown=node:node apps/api-core/tsconfig.build.json   ./tsconfig.build.json
COPY --chown=node:node apps/api-core/nest-cli.json         ./nest-cli.json

USER node

# Source code is mounted via docker-compose volume at runtime.
# On startup: generate Prisma client, then start with hot reload.
CMD ["sh", "-c", "pnpm exec prisma generate --schema=prisma/schema.postgresql.prisma && pnpm run dev"]

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
