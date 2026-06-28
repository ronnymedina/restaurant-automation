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

El stage `prod` ya es mínimo: parte de `node-slim` y copia **solo** `dist/` (el binario
compilado), las `node_modules` de producción, `prisma/` y `commands/` — descarta el código
fuente, las devDependencies y pnpm/npm. Arranca con `node dist/src/main`.

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
