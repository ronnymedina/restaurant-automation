# Publicar las imágenes en GHCR (manual)

Las imágenes públicas de self-hosting se publican a mano en GitHub Container Registry.

> **Sobre "multi-sistema":** las imágenes Docker **siempre corren Linux** (Docker Desktop
> en Windows/macOS usa una VM Linux por debajo). Lo que cambia entre máquinas no es el SO
> sino la **arquitectura de CPU**:
> - `linux/amd64` → PCs Intel/AMD (la mayoría de Windows y Linux).
> - `linux/arm64` → Macs Apple Silicon (M1/M2/M3…) y servidores ARM.
>
> Para que `docker compose pull` funcione en cualquiera de esas máquinas, publicamos una
> imagen **multi-arquitectura** (un único tag `:latest` que resuelve a la variante correcta
> según la CPU de quien hace el pull). No hace falta publicar nada específico de Windows.

## Cómo se compilan las imágenes (flujo multi-stage)

Cada app se construye con un **Dockerfile multi-stage**: una línea de montaje con varias
estaciones (`FROM ... AS <nombre>`). Cada estación fabrica una pieza; la imagen que se
publica es **solo la última** (`prod`), y las anteriores existen para producir lo que `prod`
copia. Así las herramientas pesadas de build quedan en estaciones intermedias que se
descartan, y la imagen final queda mínima.

### Backend — `apps/api-core/Dockerfile`

| Estación | Qué hace | Pieza que produce |
|----------|----------|-------------------|
| `deps` | `pnpm install` con todas las dependencias (dev + prod) | `node_modules` completo |
| `prod-deps` | instala, genera el cliente Prisma y `pnpm prune --prod` | `node_modules` **solo prod** |
| `build` | compila NestJS: `src/` → `dist/` (TypeScript → JavaScript) | `dist/` |
| `dev` | servidor con hot-reload (**no se publica**) | — |
| `prod` | **no compila nada**: junta las piezas anteriores | imagen final |

La estación `prod` (`node:24-...-slim`) solo copia: `dist/` desde `build`, `node_modules`
solo-prod desde `prod-deps`, más `prisma/` y `commands/`. Descarta el código fuente, las
devDependencies (TypeScript, el compilador de Nest) y pnpm/npm. Crea `/app/uploads` con
dueño `node` (uploads escribibles) y arranca con `node dist/src/main`.

> **Por qué tantas estaciones:** `build` necesita TODO para compilar, pero `dist/` ya es
> JavaScript puro — para *correr* no hace falta TypeScript ni el compilador. Separar permite
> que la imagen final no cargue con esas herramientas.

### Frontend — `apps/ui/Dockerfile`

| Estación | Qué hace |
|----------|----------|
| `deps` | `npm install` |
| `dev` | servidor Astro con hot-reload (**no se publica**) |
| `build` | compila Astro a estático (`dist/` con HTML/CSS/JS) |
| `prod` | **nginx** sirviendo ese `dist/` |

**El truco del placeholder (clave para una sola imagen multi-usuario):** el sitio Astro es
estático, así que la URL de la API normalmente se "hornea" al compilar — pero no sabemos la
IP de cada usuario. La solución:

1. Al **buildear**, `--build-arg PUBLIC_API_URL=__PLACEHOLDER_API_URL__` incrusta un
   texto-marcador donde iría la URL.
2. Al **arrancar el contenedor**, `docker/entrypoint.sh` hace un `sed` que reemplaza ese
   marcador por el `PUBLIC_API_URL` real (derivado del `SERVER_IP` del `.env` del usuario)
   y recién ahí lanza nginx.

Así, la **misma imagen** sirve a cualquier instalación: el ajuste ocurre en el arranque, no
en el build.

## Requisitos

- `docker` y `gh` (GitHub CLI) instalados y autenticados.
- Un Personal Access Token con scope `write:packages` (o `gh auth token`).
- Para builds multi-arquitectura: `docker buildx` (incluido en Docker Desktop).

## 1. Login a GHCR

```bash
echo "$(gh auth token)" | docker login ghcr.io -u <tu-usuario-github> --password-stdin
```

## 2. Preparar un builder multi-arquitectura (una sola vez)

El builder por defecto usa el driver `docker`, que **no** puede generar imágenes
multi-plataforma. Creá uno con el driver `docker-container`:

```bash
docker buildx create --name multiarch --driver docker-container --use --bootstrap
```

(Para volver a usarlo en sesiones futuras: `docker buildx use multiarch`.)

> En un Mac Apple Silicon, compilar la variante `linux/amd64` se hace por **emulación
> QEMU** y es bastante más lento que el build nativo `arm64`. Es normal; corré con
> paciencia. (Docker Desktop trae QEMU; si falla, `docker run --privileged --rm
> tonistiigi/binfmt --install all` registra los emuladores.)

## 3. Build + push multi-arquitectura (recomendado)

Una imagen multi-arch **debe** publicarse directo al registry: `buildx` arma una manifest
list que no se puede cargar localmente con `--load`, así que se usa `--push` en el mismo paso.
Etiquetá `:latest` **y** una versión fija a la vez.

```bash
# Backend (api-core)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/api-core/Dockerfile --target prod \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:latest \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:v1.0.0 \
  --push apps/api-core

# Frontend (ui) — hornea PUBLIC_API_URL con un placeholder que el contenedor
# reemplaza en runtime, así que la misma imagen sirve para cualquier SERVER_IP.
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/ui/Dockerfile --target prod \
  --build-arg PUBLIC_API_URL=__PLACEHOLDER_API_URL__ \
  -t ghcr.io/<tu-usuario-github>/restaurants-ui:latest \
  -t ghcr.io/<tu-usuario-github>/restaurants-ui:v1.0.0 \
  --push apps/ui
```

Verificá que la manifest list incluya ambas arquitecturas:

```bash
docker buildx imagetools inspect ghcr.io/<tu-usuario-github>/restaurants-api-core:latest
# Debe listar  linux/amd64  y  linux/arm64
```

## 4. Marcar los packages como públicos (una sola vez)

En GHCR las imágenes nacen **privadas**. En GitHub:
`Profile → Packages → restaurants-api-core → Package settings → Change visibility → Public`
(repetir para `restaurants-ui`). Sin esto, los usuarios no pueden hacer `pull` sin login.

## 5. Build local de una sola arquitectura (para probar antes de publicar)

`--load` solo funciona con **una** plataforma; sirve para probar la imagen en tu propia
máquina sin tocar el registry:

```bash
# Build nativo para tu CPU actual, cargado al Docker local (sin push)
docker buildx build \
  -f apps/api-core/Dockerfile --target prod \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:test \
  --load apps/api-core
```

(Equivale al viejo `docker build ... --target prod -t ... apps/api-core`.)

## 6. Publicar una versión nueva más adelante

Repetí el paso 3 bumpeando la etiqueta de versión (`:v1.1.0`, etc.) y manteniendo
`:latest`. Los usuarios que quieran fijar una versión usan el tag; el resto sigue `:latest`:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -f apps/api-core/Dockerfile --target prod \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:latest \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:v1.1.0 \
  --push apps/api-core
```

## 7. Problemas comunes al publicar

El build multi-arch es exigente porque la variante `linux/amd64` se compila por **emulación
QEMU** en un Mac ARM. Estos tres errores son los que aparecen en la práctica:

### `cannot allocate memory` / `ResourceExhausted` durante `pnpm install`

Docker se quedó sin RAM. El default de Docker Desktop (~4 GB) no alcanza para emular amd64 +
arm64 en paralelo. **Subí la memoria** en Docker Desktop → *Settings → Resources → Memory* a
**~8 GB** y *Apply & Restart*. Verificá con:

```bash
docker info | grep "Total Memory"
```

### `no space left on device`

El disco de la VM de Docker se llenó (imágenes viejas + caché de build). Liberá espacio
**antes** de un build pesado:

```bash
docker buildx prune -f      # caché de build (suele ser lo que más ocupa)
docker image prune -f       # imágenes dangling (sin tag)
docker container prune -f   # contenedores detenidos
docker system df            # ver cuánto queda / qué es reclamable
```

### `denied: permission_denied: The token provided does not match expected scopes`

El push a GHCR necesita el scope **`write:packages`**, que `gh auth token` **no** incluye por
defecto. Agregalo a tu sesión de `gh` y **re-logueá Docker** (el login viejo guardó el token
sin el scope):

```bash
gh auth refresh -h github.com -s write:packages    # autoriza en el navegador
echo "$(gh auth token)" | docker login ghcr.io -u <tu-usuario-github> --password-stdin
```

> Ojo: `docker login` puede decir `Login Succeeded` con un token sin el scope —
> "succeeded" solo significa que autentica, no que pueda escribir paquetes. Confirmá el
> scope con `gh auth status` (debe listar `write:packages`).
