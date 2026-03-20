# Build context: repo root
# Railway config: Root Directory = / , Dockerfile Path = apps/license-server/Dockerfile

FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# Copy workspace manifests for install
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/license-server/package.json ./apps/license-server/package.json

# Install license-server dependencies only
RUN pnpm install --filter @restaurants/license-server --frozen-lockfile

# Copy app source
COPY apps/license-server ./apps/license-server

WORKDIR /app/apps/license-server

# Patch schema to postgresql for production build
RUN sed -i 's|provider = "sqlite"|provider = "postgresql"|' prisma/schema.prisma && \
    grep -q 'provider = "postgresql"' prisma/schema.prisma

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npx nest build

# --- Runtime image ---
FROM node:22-alpine
WORKDIR /app

COPY --chown=node:node --from=builder /app/apps/license-server/dist ./dist
COPY --chown=node:node --from=builder /app/apps/license-server/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/license-server/prisma ./prisma

ENV NODE_ENV=production

EXPOSE 3001

USER node

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main"]
