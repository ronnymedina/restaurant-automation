# restaurant-automation

Plataforma **open source** de automatización para restaurantes. Incluye un **kiosco** para que
los clientes ordenen solos y un **dashboard de gestión** para el personal (productos, menús,
órdenes y caja).

Corre en cualquier servidor con Docker. Cada app se construye de forma independiente con su
propio Dockerfile — no hay workspace raíz.

---

## Apps

| App | Descripción | README | Docs |
|-----|-------------|--------|------|
| [`apps/api-core`](apps/api-core) | Backend NestJS + Prisma + PostgreSQL (REST + SSE) | [README](apps/api-core/README.md) | [docs/](apps/api-core/docs/) |
| [`apps/ui`](apps/ui) | Frontend Astro + React + Tailwind (kiosco + dashboard) | [README](apps/ui/README.md) | [docs/](apps/ui/docs/README.md) |

### Inactivas

| App | Descripción |
|-----|-------------|
| `apps/desktop` | App Electron para uso offline — presente en el repo pero **sin mantener**. |

---

## Requisitos

| Requisito | Versión | Notas |
|-----------|---------|-------|
| **Docker** | 24+ con **Compose v2** (`docker compose`) | Única dependencia obligatoria para desarrollo local. |
| **Sistema operativo** | Linux, macOS (Intel / Apple Silicon) o Windows con WSL2 | Las imágenes corren en `linux/amd64` y `linux/arm64`. |
| **Node.js** | 24.x | Solo si vas a correr una app **fuera** de Docker. Con Docker no hace falta. |
| **pnpm** | 10.x | Ídem — solo para correr sin Docker. |

---

## Levantar en local (Docker)

El repo trae un `docker-compose.yml` que construye las apps desde el código (stage `dev`, con
hot reload) y levanta PostgreSQL. En cuatro pasos tenés el stack andando.

### 1. Configurá las variables de entorno

Cada app lee su propio `.env`:

```bash
# Backend — copiá el ejemplo (ya trae los defaults que coinciden con el compose)
cp apps/api-core/.env.example apps/api-core/.env

# Frontend — apps/ui/.env ya viene con defaults para local
```

Editá `apps/api-core/.env` y definí un `JWT_SECRET` (mínimo 32 caracteres):

```bash
openssl rand -base64 48   # pegá el resultado en JWT_SECRET
```

El resto de los defaults ya apuntan al compose:
`DATABASE_URL=postgresql://postgres:postgres@res-db:5432/restaurants`.
La referencia completa de variables está en
**[apps/api-core/docs/environments.md](apps/api-core/docs/environments.md)**.

### 2. Levantá el stack

```bash
docker compose up                       # api + ui + postgres
# o servicios sueltos:
docker compose up res-api-core res-db   # solo backend + base
docker compose up res-ui                # solo frontend
```

`src/` y `prisma/` se montan como volúmenes: los cambios recargan sin reconstruir la imagen.

### 3. Aplicá las migraciones (y datos demo, opcional)

En dev las migraciones no corren solas:

```bash
docker compose exec res-api-core pnpm run migrate:deploy

# Opcional — restaurante + admin + productos de demostración:
docker compose exec res-api-core pnpm run cli create-dummy
```

### 4. Abrí la app

| Servicio | URL |
|----------|-----|
| Frontend (kiosco + dashboard) | http://localhost:4321 |
| API | http://localhost:3000 |
| Swagger (docs de la API, solo dev) | http://localhost:3000/docs |

Con la base vacía, entrá a **http://localhost:4321** y completá el onboarding de tu restaurante.

> ¿Sin proveedor de email configurado? El registro te devuelve un `activationUrl` en la
> respuesta para activar la cuenta sin salir de local.

---

## Variables de entorno

Cada servicio lee su propio archivo `.env`. Las variables marcadas como obligatorias hacen que
la app no arranque si faltan.

| App | Archivo | Base | Referencia completa |
|-----|---------|------|---------------------|
| api-core | `apps/api-core/.env` | [`.env.example`](apps/api-core/.env.example) | [environments.md](apps/api-core/docs/environments.md) |
| ui | `apps/ui/.env` | — | [apps/ui/README.md](apps/ui/README.md) |

Para un self-host de **un solo local**, poné `SINGLE_RESTAURANT_MODE=true`: cierra el registro
público (backend) apenas existe el primer restaurante.

---

## Tests

Los tests corren **dentro del contenedor**, no en local:

```bash
docker compose exec res-api-core pnpm test        # unit
docker compose exec res-api-core pnpm test:cov    # coverage
docker compose exec res-api-core pnpm test:e2e    # e2e
```

---

## Stages de Docker

Cada app usa un Dockerfile multi-stage y se construye **standalone** desde su propia carpeta
(`context: ./apps/<app>`) — sin contexto raíz ni workspace. El `docker-compose.yml` usa el stage
`dev`; el despliegue de producción usa `prod`.

| Stage | api-core | ui |
|-------|----------|----|
| `dev` | NestJS con hot reload | Astro dev server |
| `build` | Compila NestJS → `dist/` | Build estático con placeholder de `PUBLIC_API_URL` |
| `prod` | Node slim + migraciones al arrancar | nginx + inyección de `PUBLIC_API_URL` en runtime |
