FROM node:24.15.0-bookworm AS deps

WORKDIR /deps

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

RUN chown -R node:node /deps

# ============================
# Stage: prod-deps
# ============================
FROM node:24.15.0-bookworm AS prod-deps

WORKDIR /prod-deps

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

RUN pnpm exec prisma generate --schema=./prisma/schema.postgresql.prisma

RUN pnpm prune --prod

# ============================
# Stage: build
# ============================
FROM node:24.15.0-bookworm AS build

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

WORKDIR /builder

COPY package.json pnpm-lock.yaml ./

COPY nest-cli.json \
    tsconfig.json \
    tsconfig.build.json \
    ./

COPY prisma   ./prisma
COPY src      ./src
COPY commands ./commands
COPY scripts  ./scripts

COPY --from=deps /deps/node_modules ./node_modules

# Generate Prisma client for PostgreSQL (prod schema)
RUN pnpm exec prisma generate --schema=./prisma/schema.postgresql.prisma

# Compile NestJS → dist/
RUN pnpm run build


FROM deps AS dev

ENV NODE_ENV=development

WORKDIR /app

COPY --chown=node:node .npmrc              ./.npmrc
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

# Generate before switching to non-root user (pnpm store is root-owned).
# The prisma/ volume mount in docker-compose overlays this at runtime for live schema edits.
RUN pnpm exec prisma generate --schema=prisma/schema.postgresql.prisma

USER node

# src/ and prisma/ are mounted via docker-compose volumes for hot reload.
CMD ["sh", "-c", "pnpm run dev"]

# ============================
# Stage: obfuscate
# ============================
FROM build AS obfuscate

# Ofusca /builder/dist in-place. javascript-obfuscator viene en los node_modules
# heredados del stage 'deps'. WORKDIR es /builder (del stage build).
RUN node ./scripts/obfuscate.mjs

# ============================
# Stage: prod-obfuscated
# ============================
# Idéntico a 'prod', salvo que el dist proviene del stage 'obfuscate'.
# Se define ANTES de 'prod' a propósito: 'prod' debe quedar como último stage del
# Dockerfile para que el build por defecto (Railway/cloud) lo use sin ofuscar.
# La imagen ofuscada se construye con --target prod-obfuscated explícito.
FROM node:24.15.0-bookworm-slim AS prod-obfuscated

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y && apt-get install -y openssl --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm \
    && rm -f /usr/local/bin/npx

WORKDIR /app

COPY --from=obfuscate --chown=node:node /builder/dist           ./dist
COPY --from=prod-deps --chown=node:node /prod-deps/node_modules ./node_modules
COPY --from=build     --chown=node:node /builder/prisma         ./prisma
COPY --from=build     --chown=node:node /builder/commands       ./commands
COPY --chown=node:node prisma.config.ts ./prisma.config.ts

RUN chmod +x ./commands/execute-migrations.sh ./commands/resend-activation.sh

RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node

EXPOSE 3000

CMD ["sh", "-c", "node dist/src/main"]

# ============================
# Stage: prod
# ============================
# Último stage del archivo: es el target por defecto (sin --target) que usa el
# build de cloud/Railway. Sin ofuscar, para conservar stack traces legibles.
FROM node:24.15.0-bookworm-slim AS prod

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y && apt-get install -y openssl --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm \
    && rm -f /usr/local/bin/npx

WORKDIR /app

COPY --from=build     --chown=node:node /builder/dist           ./dist
COPY --from=prod-deps --chown=node:node /prod-deps/node_modules ./node_modules
COPY --from=build     --chown=node:node /builder/prisma         ./prisma
COPY --from=build     --chown=node:node /builder/commands       ./commands
COPY --chown=node:node prisma.config.ts ./prisma.config.ts

RUN chmod +x ./commands/execute-migrations.sh ./commands/resend-activation.sh

RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node

EXPOSE 3000

CMD ["sh", "-c", "node dist/src/main"]
