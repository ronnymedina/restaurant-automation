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
