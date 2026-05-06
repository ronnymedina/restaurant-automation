# api-core

Backend NestJS + Prisma + PostgreSQL para la plataforma de restaurantes.

## Desarrollo local

```bash
# Con Docker Compose (desde la raíz del repo)
docker compose up res-api-core res-db

# Sin Docker
pnpm install
pnpm run dev
```

El stage `dev` del Dockerfile monta `src/` y `prisma/` como volúmenes para hot reload.

## Comandos

```bash
pnpm run dev          # watch mode
pnpm test             # unit tests
pnpm test:e2e         # e2e tests
pnpm test:cov         # cobertura
```

### Prisma

```bash
pnpm exec prisma migrate dev --name <nombre>   # nueva migración
pnpm exec prisma generate                       # regenerar cliente
pnpm exec prisma studio                         # UI de base de datos
```

### CLI de gestión

```bash
pnpm run cli create-dummy                                              # restaurante demo + admin + productos
pnpm run cli create-restaurant --name <nombre>                         # crear restaurante
pnpm run cli create-admin -e <email> -p <password> --restaurant-id <id>
```

## Docker

El `Dockerfile` tiene tres stages:

| Stage | Base | Uso |
|-------|------|-----|
| `deps` | `node:24-bookworm` | Instala dependencias — reutilizado por los demás stages |
| `dev` | `deps` | NestJS con hot reload; `src/` y `prisma/` se montan como volúmenes |
| `build` | `deps` | Compila NestJS → `dist/` y poda devDependencies |
| `prod` | `node:24-slim` | Imagen mínima; corre migraciones Prisma al arrancar |

Railway usa el stage `prod`.

## Deploy (Railway)

El contenedor de producción corre migraciones automáticamente al iniciar:

```
node dist/src/main
```

Las migraciones se ejecutan vía Prisma antes de que NestJS arranque (ver `src/main.ts`).

## Variables de entorno

Ver [`docs/environments.md`](docs/environments.md) para la referencia completa.

Variables requeridas mínimas:

| Variable | Descripción |
|----------|-------------|
| `NODE_ENV` | `development` o `production` |
| `DATABASE_URL` | Connection string PostgreSQL |
| `PORT` | Puerto de la API (default `3000`) |
| `JWT_SECRET` | Clave para firmar tokens JWT |
| `JWT_ACCESS_EXPIRATION` | Duración del access token (ej. `15m`) |
| `JWT_REFRESH_EXPIRATION` | Duración del refresh token (ej. `7d`) |
| `BCRYPT_SALT_ROUNDS` | Costo de hashing de contraseñas |
