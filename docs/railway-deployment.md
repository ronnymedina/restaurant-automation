# Deploy en producción con Railway (cloud)

Guía para levantar **toda la plataforma** (api-core + ui + base de datos) en
[Railway](https://railway.app) como SaaS cloud sobre HTTPS.

> **Diferencia con self-hosting:** la guía [`self-hosting.md`](./self-hosting.md) corre el
> sistema en una **LAN sobre HTTP** (una PC servidor, acceso por IP). Esta guía lo corre en
> **cloud con HTTPS y dominios públicos**. Es la **misma imagen** en ambos casos — lo que
> cambia es la configuración: HTTPS, cookies `Secure`, base de datos gestionada y
> almacenamiento de objetos. No mezcles las dos configuraciones.

---

## 1. Arquitectura del deploy

Railway organiza todo en un **proyecto** con varios **servicios**:

| Servicio | Qué es | Dominio público (ejemplo) |
|----------|--------|---------------------------|
| **PostgreSQL** | Base de datos gestionada por Railway | (interno, no expuesto) |
| **api-core** | Backend NestJS (imagen `prod`) | `https://resapi.daikulab.com` |
| **ui** | Frontend Astro + nginx (imagen `prod`) | `https://resapp.daikulab.com` |
| **Redis** *(opcional)* | Caché si usás `CACHE_DRIVER=redis` | (interno) |

Los dos servicios web comparten el dominio raíz `daikulab.com` (subdominios `resapp.*` y
`resapi.*`) para que las cookies de sesión funcionen entre ambos — ver §6.

---

## 2. Requisitos previos

- Cuenta en Railway y la [CLI](https://docs.railway.app/develop/cli) (`railway login`) o
  acceso al dashboard web.
- Un **dominio** propio (ej. `daikulab.com`) con acceso a su DNS, para apuntar los
  subdominios a Railway.
- *(Recomendado)* Un bucket de **Cloudflare R2** para las imágenes de productos — el
  filesystem de Railway es **efímero** (se borra en cada deploy), así que `UPLOAD_STORAGE=local`
  **no sirve** en cloud. Ver §7.

---

## 3. Fuente de las imágenes: dos opciones

Railway puede desplegar cada servicio de dos maneras. Elegí una por servicio:

### Opción A — Build desde el repo (recomendado para este proyecto)

Railway clona el repo y construye el `Dockerfile` (stage `prod`) en cada push. Es como está
montado hoy. Configurás en cada servicio:

- **Root Directory / Dockerfile Path:** `apps/api-core/Dockerfile` (y `apps/ui/Dockerfile`).
- Railway usa el último stage (`prod`) automáticamente.

Opcionalmente, fijá esto con un `railway.toml` en la raíz del servicio (mismo formato que
`apps/license-server/railway.toml`):

```toml
[build]
dockerfilePath = "apps/api-core/Dockerfile"

[deploy]
restartPolicyType = "ON_FAILURE"
```

### Opción B — Imagen pública de GHCR

Usa las imágenes multi-arch ya publicadas (ver
[`self-hosting-publishing.md`](./self-hosting-publishing.md)). En el servicio de Railway,
**Source → Docker Image**:

- api-core: `ghcr.io/ronnymedina/restaurants-api-core:v1.0.0`
- ui: `ghcr.io/ronnymedina/restaurants-ui:v1.0.0`

Ventaja: desacopla build de deploy y fija una versión exacta. Desventaja: tenés que
republicar la imagen (no basta un `git push`) para cada cambio.

> **Nota sobre la UI con imagen GHCR:** la imagen de UI hornea `PUBLIC_API_URL` con un
> placeholder que el contenedor reemplaza en arranque (ver §5). Funciona igual en Railway:
> basta con definir la variable `PUBLIC_API_URL` en el servicio.

---

## 4. Provisionar la base de datos

1. En el proyecto de Railway: **New → Database → PostgreSQL**.
2. Railway expone una variable `DATABASE_URL` en ese servicio. En el servicio **api-core**,
   referenciala con la sintaxis de Railway:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```
   (no la copies a mano: la referencia se actualiza sola si rotan credenciales).

### Migraciones

La imagen `prod` arranca con `node dist/src/main` y **no corre migraciones por sí sola**. En
self-host el compose las dispara con un `command`; en Railway configurá un **Custom Start
Command** en el servicio api-core que las aplique antes de arrancar:

```
./commands/execute-migrations.sh && node dist/src/main
```

`execute-migrations.sh` ejecuta `prisma migrate deploy` (aplica las migraciones pendientes,
idempotente y seguro para correr en cada deploy).

---

## 5. Variables de entorno — api-core

Configuralas como **Service Variables** del servicio api-core. Referencia completa en
[`apps/api-core/docs/environments.md`](../apps/api-core/docs/environments.md).

```bash
# --- App ---
NODE_ENV=production
PORT=3000                                   # Railway lo inyecta; usá el suyo si difiere
DATABASE_URL=${{Postgres.DATABASE_URL}}
API_BASE_URL=https://resapi.daikulab.com    # base pública de la API (URLs de uploads)
FRONTEND_URL=https://resapp.daikulab.com

# --- JWT (generá un secreto único: openssl rand -base64 48) ---
JWT_SECRET=<secreto-aleatorio-min-32-chars>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# --- Cookies / CORS (HTTPS) ---
COOKIE_DOMAIN=.daikulab.com                 # compartir cookies entre resapp.* y resapi.*
COOKIE_SECURE=true                          # OBLIGATORIO en HTTPS
COOKIE_ACCESS_MAX_AGE=900000
COOKIE_REFRESH_MAX_AGE=604800000
CORS_ORIGIN=https://resapp.daikulab.com

# --- Passwords ---
BCRYPT_SALT_ROUNDS=12

# --- Caché ---
CACHE_DRIVER=memory                         # o 'redis' + REDIS_URL si agregás Redis

# --- Uploads (ver §7) ---
UPLOAD_STORAGE=r2
UPLOAD_CF_R2_ACCOUNT_ID=<...>
UPLOAD_CF_R2_ACCESS_KEY_ID=<...>
UPLOAD_CF_R2_SECRET_ACCESS_KEY=<...>
UPLOAD_CF_R2_BUCKET_NAME=<...>
UPLOAD_CF_R2_PUBLIC_URL=https://pub-xxxx.r2.dev

# --- Email (activación de usuarios) ---
RESEND_API_KEY=<...>
EMAIL_FROM=no-reply@daikulab.com

# --- IA de productos (opcional) ---
GEMINI_API_KEY=<...>
GEMINI_MODEL=gemini-1.5-flash
```

> **Lo que NUNCA debe copiarse del self-host LAN:** `COOKIE_SECURE=false` y URLs con IP. En
> cloud van con `https://` y `COOKIE_SECURE=true`, o las sesiones y CORS fallan.

---

## 6. Variables de entorno — ui

El frontend solo necesita saber dónde está la API. Como es un sitio estático, la URL se
inyecta en el **arranque** del contenedor (mecanismo de placeholder; detalle en
[`apps/ui/README.md`](../apps/ui/README.md)):

```bash
PUBLIC_API_URL=https://resapi.daikulab.com
```

Si falta, el contenedor **no arranca** (el `entrypoint.sh` aborta).

---

## 7. Almacenamiento de imágenes (uploads)

El filesystem de Railway es **efímero**: cualquier archivo escrito en `/app/uploads` se
pierde en el próximo deploy. Por eso en cloud se usa **Cloudflare R2** (S3-compatible), que
el código ya soporta nativamente:

1. Creá un bucket en Cloudflare R2 y una API token con acceso de lectura/escritura.
2. Habilitá el acceso público del bucket (o un dominio `r2.dev` / dominio propio).
3. Seteá las variables `UPLOAD_STORAGE=r2` + `UPLOAD_CF_R2_*` (ver §5).

Con esto, las imágenes de productos se suben a R2 y las URLs públicas apuntan a
`UPLOAD_CF_R2_PUBLIC_URL`, persistentes entre deploys.

---

## 8. Dominios y DNS

1. En cada servicio web de Railway: **Settings → Networking → Custom Domain**.
   - api-core → `resapi.daikulab.com`
   - ui → `resapp.daikulab.com`
2. Railway te da un destino CNAME. En tu DNS, creá los registros:
   ```
   resapi.daikulab.com  CNAME  <destino-railway-api>
   resapp.daikulab.com  CNAME  <destino-railway-ui>
   ```
3. Railway provisiona el certificado TLS automáticamente (HTTPS sin configuración extra).

> Los subdominios **deben** compartir el dominio raíz que pusiste en `COOKIE_DOMAIN`
> (`.daikulab.com`), o las cookies de sesión no se compartirán entre frontend y API.

---

## 9. Orden de despliegue y verificación

1. **PostgreSQL** primero (los demás dependen de `DATABASE_URL`).
2. **api-core** — al desplegar, el Custom Start Command corre las migraciones y arranca.
   Verificá en los logs: `All migrations have been successfully applied` y
   `Nest application successfully started`.
3. Probá la salud: `curl https://resapi.daikulab.com/health` → `{"status":"ok"}`.
4. **ui** — abrí `https://resapp.daikulab.com`. Debe cargar y el onboarding traer la lista
   de países (si falla, casi siempre es CORS / cookies — ver §11).

---

## 10. Actualizar a una nueva versión

- **Opción A (build desde repo):** un `git push` a la rama conectada dispara el rebuild y
  redeploy automático. Las migraciones se aplican solas por el Custom Start Command.
- **Opción B (imagen GHCR):** republicá la imagen con el nuevo tag (ver
  `self-hosting-publishing.md`) y actualizá la referencia de imagen en el servicio.

---

## 11. Problemas comunes

- **No puedo iniciar sesión / la sesión se pierde al recargar:** revisá que
  `COOKIE_SECURE=true`, `COOKIE_DOMAIN=.daikulab.com` y que ambos servicios estén bajo ese
  dominio raíz sobre HTTPS. Con HTTP o dominios distintos, el navegador descarta la cookie.
- **El onboarding no carga países / CORS bloqueado:** `CORS_ORIGIN` debe ser **exactamente**
  el origen del frontend (`https://resapp.daikulab.com`, sin barra final, con `https`).
- **Las imágenes de productos desaparecen tras un deploy:** seguís en `UPLOAD_STORAGE=local`.
  Pasá a R2 (§7).
- **El servicio crashea al arrancar (config validation):** falta alguna variable
  **required** (`NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_EXPIRATION`,
  `JWT_REFRESH_EXPIRATION`, `BCRYPT_SALT_ROUNDS`, `CACHE_DRIVER`). El log indica cuál.
- **`prisma migrate deploy` falla:** confirmá que `DATABASE_URL` apunte al Postgres de
  Railway y que el servicio de DB esté arriba antes que api-core.
