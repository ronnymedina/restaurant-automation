# apps/ui

Astro static site — kiosk and management dashboard for the restaurant platform.

## Desarrollo local

```bash
# Sin Docker
pnpm dev          # servidor en localhost:4321

# Con Docker Compose (desde la raíz del repo)
docker compose up res-ui
```

## Build

```bash
pnpm build        # genera dist/
pnpm preview      # previsualiza el build estático
```

## Auth flow

El dashboard usa **cookies httpOnly** para autenticación (H-04). Al hacer login, el backend setea dos cookies: `access_token` (Path=/) y `refresh_token` (Path=/v1/auth). Ambas con `sameSite=lax`, `secure` en prod y `domain=.daikulab.com` para que se compartan entre `resapp.*` y `resapi.*`.

- Los tokens **no son accesibles desde JavaScript**. `localStorage` solo cachea la timezone del restaurante.
- Todos los fetches al API pasan por `apiFetch` en [`src/lib/api.ts`](./src/lib/api.ts), que setea `credentials: 'include'` para que el navegador envíe la cookie cross-origin. El auto-refresh sobre 401 también se mantiene.
- El SSE del dashboard (`/v1/events/dashboard`) usa `new EventSource(url, { withCredentials: true })`.
- El login (`/login`) hace `POST /v1/auth/login` con `credentials: 'include'`; la respuesta solo trae `{ timezone }` — las cookies vienen en `Set-Cookie`. El logout hace `POST /v1/auth/logout` y limpia la timezone cacheada.

### Cocina

La página `/kitchen` usa un mecanismo independiente: header `X-Kitchen-Token` tanto en REST (`kitchenFetch`) como en SSE (vía [`@microsoft/fetch-event-source`](https://www.npmjs.com/package/@microsoft/fetch-event-source), porque el `EventSource` nativo no soporta headers custom). El token se lee del query param al primer load y se persiste en `sessionStorage`.

## Deploy (Railway)

El frontend se despliega en Railway como una imagen Docker con nginx.

### Cómo funciona

Astro bake las variables `PUBLIC_*` dentro del bundle JS en tiempo de build. Esto significa que no se pueden cambiar en runtime sin reconstruir la imagen. Para evitar tener que reconstruir por cada entorno, se usa un mecanismo de **inyección dinámica con placeholder**:

1. **Build:** la imagen se construye con `PUBLIC_API_URL=__PLACEHOLDER_API_URL__`. El placeholder queda literal dentro de los archivos `.js` compilados.

2. **Arranque del contenedor:** `docker/entrypoint.sh` reemplaza el placeholder con el valor real de `$PUBLIC_API_URL` usando `sed`:
   ```sh
   find /usr/share/nginx/html -name "*.js" \
     -exec sed -i "s#__PLACEHOLDER_API_URL__#${PUBLIC_API_URL}#g" {} +
   ```

3. **nginx** sirve los archivos ya con la URL correcta.

### Variables de entorno en Railway

| Variable | Descripción |
|----------|-------------|
| `PUBLIC_API_URL` | URL del backend (ej. `https://api.tudominio.com`) |

Se configura como **Service Variable** en Railway. El contenedor no arranca si no está definida.

Ver referencia completa de todas las variables en [`docs/environments.md`](./docs/environments.md). Ver toda la documentación en [`docs/`](./docs/README.md).

### Dockerfile

El `Dockerfile` tiene 4 stages:

| Stage | Base | Uso |
|-------|------|-----|
| `deps` | `node:24-alpine` | Instala dependencias — reutilizado por los demás stages |
| `dev` | `deps` | Dev server con hot reload (`astro dev --host`) |
| `build` | `deps` | Build estático con placeholder bakeado |
| `prod` | `nginx:alpine` | Sirve `dist/` con inyección de URL en arranque |

Railway usa el stage `prod` (último stage por defecto).

> Para más detalle sobre el mecanismo de inyección, ver [`docs/dynamic-url-injection.md`](docs/dynamic-url-injection.md).
