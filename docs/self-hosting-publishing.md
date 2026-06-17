# Publicar las imágenes en GHCR (manual)

Las imágenes públicas de self-hosting se publican a mano en GitHub Container Registry.

## Requisitos

- `docker` y `gh` (GitHub CLI) instalados y autenticados.
- Un Personal Access Token con scope `write:packages` (o `gh auth token`).

## 1. Login a GHCR

```bash
echo "$(gh auth token)" | docker login ghcr.io -u <tu-usuario-github> --password-stdin
```

## 2. Build de las imágenes (stage prod)

```bash
# Desde la raíz del repo
docker build -f apps/api-core/Dockerfile --target prod \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:latest apps/api-core

# La UI hornea PUBLIC_API_URL con un placeholder que el contenedor reemplaza en runtime.
docker build -f apps/ui/Dockerfile --target prod \
  --build-arg PUBLIC_API_URL=__PLACEHOLDER_API_URL__ \
  -t ghcr.io/<tu-usuario-github>/restaurants-ui:latest apps/ui
```

## 3. Push

```bash
docker push ghcr.io/<tu-usuario-github>/restaurants-api-core:latest
docker push ghcr.io/<tu-usuario-github>/restaurants-ui:latest
```

## 4. Marcar los packages como públicos (una sola vez)

En GHCR las imágenes nacen **privadas**. En GitHub:
`Profile → Packages → restaurants-api-core → Package settings → Change visibility → Public`
(repetir para `restaurants-ui`). Sin esto, los usuarios no pueden hacer `pull` sin login.

## 5. Versionado (opcional)

Además de `:latest`, etiquetá con la versión para que los usuarios puedan fijarla:

```bash
docker tag ghcr.io/<usuario>/restaurants-api-core:latest ghcr.io/<usuario>/restaurants-api-core:v1.0.0
docker push ghcr.io/<usuario>/restaurants-api-core:v1.0.0
```
