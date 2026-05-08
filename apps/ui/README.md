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

> Para más detalle sobre el mecanismo de inyección, ver [`docs/ui/dynamic-url-injection.md`](../../docs/ui/dynamic-url-injection.md).
