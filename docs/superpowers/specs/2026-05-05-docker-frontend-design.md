# Docker para apps/ui — Diseño

**Fecha:** 2026-05-05
**Estado:** Aprobado

## Contexto

`apps/ui` es un sitio Astro con `output: 'static'`. Necesita un Dockerfile multi-stage para desarrollo local (hot reload) y despliegue en Railway (sitio estático servido con nginx).

`PUBLIC_API_URL` se bake en el bundle JS en tiempo de build (limitación de Astro estático). Para que Railway pueda configurarla como variable de entorno en runtime sin reconstruir la imagen, se usa inyección dinámica via entrypoint.

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `apps/ui/Dockerfile` | Crear |
| `apps/ui/docker/entrypoint.sh` | Crear |
| `apps/ui/docker/nginx.conf` | Crear |
| `docker-compose.yml` | Agregar servicio `res-ui` |
| `apps/ui/.env` | Agregar `PUBLIC_API_URL` |
| `docs/ui/dynamic-url-injection.md` | Crear |

## Dockerfile — 4 stages

### `deps`
- Base: `node:24-alpine`
- Copia `package.json`, corre `npm install` (sin lockfile propio en `apps/ui` — las versiones exactas en `package.json` garantizan reproducibilidad suficiente)
- Reutilizado por los stages siguientes

### `dev`
- Extiende `deps`
- Corre `astro dev --host` para exponer fuera del contenedor
- Usado por `docker-compose.yml` con volumes montados sobre `src/`

### `build`
- Extiende `deps`
- Recibe `ARG PUBLIC_API_URL=__PLACEHOLDER_API_URL__`
- Corre `astro build` — el placeholder queda bakeado en los `.js`

### `prod`
- Base: `nginx:alpine`
- Copia `dist/` desde el stage `build`
- Copia `nginx.conf` y `entrypoint.sh`
- Al arrancar, `entrypoint.sh` reemplaza el placeholder por `$PUBLIC_API_URL`
- Expone puerto 80

## Runtime injection

**Problema:** Astro bake `PUBLIC_*` en el bundle en tiempo de build, no en runtime.

**Solución:**
1. Build con `PUBLIC_API_URL=__PLACEHOLDER_API_URL__` (string fijo conocido)
2. Al arrancar el contenedor prod, `entrypoint.sh` corre:
   ```sh
   find /usr/share/nginx/html -name "*.js" \
     -exec sed -i "s|__PLACEHOLDER_API_URL__|${PUBLIC_API_URL}|g" {} +
   ```
3. nginx sirve los archivos ya con la URL correcta

**Trade-off:** El reemplazo es a nivel de texto en archivos ya compilados. Si se agregan nuevas variables `PUBLIC_*` en el futuro, cada una necesita su propio placeholder y su línea de `sed` en `entrypoint.sh`.

## nginx

Configuración mínima con `try_files $uri $uri/index.html /index.html` para resolver correctamente las rutas estáticas de Astro (ej. `/dash/orders/` → `dist/dash/orders/index.html`).

## docker-compose (desarrollo local)

Servicio `res-ui` con:
- Target `dev`
- Context `./apps/ui`
- Volumes: `src/` y `public/` para hot reload
- `env_file: ./apps/ui/.env`
- `depends_on: res-api-core`
- Puerto `${UI_PORT:-4321}:4321`

## Railway (producción)

- Railway construye la imagen usando el `Dockerfile` directamente (no docker-compose)
- Target implícito es el último stage (`prod`)
- `PUBLIC_API_URL` se configura como Service Variable en Railway
- La inyección ocurre en cada arranque del contenedor

## Documentación

`docs/ui/dynamic-url-injection.md` explica el mecanismo para futuros desarrolladores: por qué existe el placeholder, cómo funciona el reemplazo, y qué hacer si se agregan nuevas variables `PUBLIC_*`.
