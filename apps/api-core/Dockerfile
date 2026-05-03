FROM node:24.15.0-bookworm AS deps

WORKDIR /deps

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

RUN chown -R node:node /deps

# ============================
# Stage: build
# ============================
FROM node:24.15.0-bookworm AS build

WORKDIR /builder

COPY package.json pnpm-lock.yaml ./

COPY nest-cli.json \
    tsconfig.json \
    tsconfig.build.json \
    ./

COPY prisma ./prisma
COPY src    ./src

COPY --from=deps /deps/node_modules ./node_modules

# Generate Prisma client for PostgreSQL (prod schema)
RUN pnpm exec prisma generate --schema=./prisma/schema.postgresql.prisma

# Compile NestJS → dist/
RUN pnpm run build

# Strip devDependencies for the production image
RUN pnpm prune --prod


FROM deps AS dev

ENV NODE_ENV=development

WORKDIR /app

COPY --chown=node:node package.json        ./package.json
COPY --chown=node:node tsconfig.json       ./tsconfig.json
COPY --chown=node:node tsconfig.build.json ./tsconfig.build.json
COPY --chown=node:node nest-cli.json       ./nest-cli.json
COPY --chown=node:node prisma.config.ts    ./prisma.config.ts
COPY --chown=node:node prisma             ./prisma
COPY --chown=node:node commands            ./commands


# Symlink deps node_modules so pnpm/nest can resolve packages
RUN ln -s /deps/node_modules /app/node_modules \
    && chown node:node /app

USER node

# Generate Prisma client (types) at build time so TypeScript can resolve them.
# The prisma/ volume mount in docker-compose overlays this at runtime for live schema edits.
RUN pnpm exec prisma generate --schema=prisma/schema.postgresql.prisma

# src/ and prisma/ are mounted via docker-compose volumes for hot reload.
CMD ["sh", "-c", "pnpm run dev"]

# ============================
# Stage: prod
# ============================
FROM node:24.15.0-bookworm-slim AS prod

# Remove npm/npx — not needed in prod, reduces attack surface
RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm \
    && rm -f /usr/local/bin/npx

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /builder/dist         ./dist
COPY --from=build --chown=node:node /builder/node_modules ./node_modules
COPY --from=build --chown=node:node /builder/prisma       ./prisma
COPY --from=build --chown=node:node /builder/commands       ./commands

USER node

EXPOSE 3000

# Run migrations at startup using the Prisma binary directly (no pnpm/npm in prod)
CMD ["sh", "-c", "node dist/src/main"]
