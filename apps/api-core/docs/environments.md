# Variables de Entorno — api-core

Las variables marcadas como **Required: `true`** deben estar presentes al iniciar la aplicación. Si faltan, la aplicación lanza un error y no arranca.

---

### APLICACIÓN

* **NODE_ENV**: Entorno de ejecución.
  - Default: ninguno
  - Required: `true`
  - Valores: `development`, `production`, `test`

* **DATABASE_URL**: URL de conexión a la base de datos PostgreSQL.
  - Default: ninguno
  - Required: `true`
  - Ejemplo: `postgresql://user:password@localhost:5432/restaurants`

* **PORT**: Puerto en que escucha la API.
  - Default: ninguno
  - Required: `true`
  - Rango válido: `1–65535`

* **API_BASE_URL**: URL pública de la API (usada en presigned URLs).
  - Default: `http://localhost:3000`
  - Required: `false`

* **FRONTEND_URL**: URL del frontend (usada en CORS y redirecciones).
  - Default: `http://localhost:4321`
  - Required: `false`

---

### AUTH / JWT

* **JWT_SECRET**: Clave secreta para firmar tokens JWT.
  - Default: ninguno
  - Required: `true`
  - **Producción**: mínimo 32 caracteres, generado aleatoriamente. Usar `openssl rand -base64 48`.
  - No reutilizar el mismo valor entre entornos.

* **JWT_ACCESS_EXPIRATION**: Duración del access token.
  - Default: ninguno
  - Required: `true`
  - Formato: `15m`, `1h`, `2h`
  - **Producción recomendado**: `15m` (tokens de corta duración reducen el riesgo de exposición)

* **JWT_REFRESH_EXPIRATION**: Duración del refresh token.
  - Default: ninguno
  - Required: `true`
  - Formato: `7d`, `30d`
  - **Producción recomendado**: `7d`. Valores mayores a `30d` no son recomendados.

---

### USUARIOS / EMAIL

* **BCRYPT_SALT_ROUNDS**: Costo de hashing para contraseñas.
  - Default: ninguno
  - Required: `true`
  - Rango válido: `10–15`
  - **Producción recomendado**: `12` (~250ms por hash, balance seguridad/rendimiento). Valores mayores a `15` impactan el rendimiento del servidor.

* **RESEND_API_KEY**: API Key de Resend para envío de correos.
  - Default: `""` (vacío)
  - Required: `false` (requerido para activación de usuarios)

* **EMAIL_FROM**: Dirección remitente en correos enviados.
  - Default: `onboarding@resend.dev`
  - Required: `false`

---

### CACHE

* **CACHE_DRIVER**: Motor de caché.
  - Default: ninguno
  - Required: `true`
  - Valores: `memory`, `redis`

* **REDIS_URL**: URL de conexión a Redis.
  - Default: `redis://localhost:6379`
  - Required: `false` (requerido cuando `CACHE_DRIVER=redis`)

---

### UPLOADS / ALMACENAMIENTO

* **UPLOAD_STORAGE**: Motor de almacenamiento de archivos.
  - Default: `local`
  - Required: `false`
  - Valores: `local`, `r2`

* **UPLOADS_PATH**: Ruta local donde se guardan los archivos subidos.
  - Default: `<cwd>/uploads`
  - Required: `false`

* **UPLOAD_PRESIGN_EXPIRY_SECONDS**: Segundos de validez de una URL prefirmada.
  - Default: `120`
  - Required: `false`

#### Cloudflare R2 — requeridas cuando `UPLOAD_STORAGE=r2`

* **UPLOAD_CF_R2_ACCOUNT_ID**: Account ID de Cloudflare.
  - Default: `""` (vacío)
  - Required: `false`

* **UPLOAD_CF_R2_ACCESS_KEY_ID**: Access Key ID del bucket R2.
  - Default: `""` (vacío)
  - Required: `false`

* **UPLOAD_CF_R2_SECRET_ACCESS_KEY**: Secret Access Key del bucket R2.
  - Default: `""` (vacío)
  - Required: `false`

* **UPLOAD_CF_R2_BUCKET_NAME**: Nombre del bucket R2.
  - Default: `""` (vacío)
  - Required: `false`

* **UPLOAD_CF_R2_PUBLIC_URL**: URL pública del bucket.
  - Default: `""` (vacío)
  - Required: `false`
  - Ejemplo: `https://pub-abc123.r2.dev`

---

### KITCHEN

* **KITCHEN_TOKEN_EXPIRY_DAYS**: Días de validez del token de cocina.
  - Default: ninguno
  - Required: `true`

---

### PAGINACIÓN / PRODUCTOS

* **DEFAULT_PAGE_SIZE**: Cantidad de items por página en listados paginados.
  - Default: `10`
  - Required: `false`

* **PRODUCTS_MAX_PAGE_SIZE**: Límite máximo de items por página en productos.
  - Default: `50`
  - Required: `false`

* **PRODUCTS_DEFAULT_CATEGORY_NAME**: Nombre de la categoría por defecto al crear productos.
  - Default: `default`
  - Required: `false`

* **BATCH_SIZE**: Tamaño de lote para creación masiva de productos (onboarding AI).
  - Default: `10`
  - Required: `false`

---

### AI / ONBOARDING

* **GEMINI_API_KEY**: API Key de Google Gemini.
  - Default: `""` (vacío)
  - Required: `false`

* **GEMINI_MODEL**: Modelo de Gemini a usar.
  - Default: `""` (vacío)
  - Required: `false` (requerido si `GEMINI_API_KEY` está configurado)
  - Ejemplo: `gemini-1.5-flash`

* **MAX_FILE_SIZE_MB**: Tamaño máximo por foto en MB.
  - Default: `5`
  - Required: `false`

* **MAX_FILES**: Cantidad máxima de fotos por solicitud.
  - Default: `3`
  - Required: `false`

---

### PRINT

* **PRINT_CUSTOMER_ON_CREATE**: Si `true`, imprime el ticket del cliente al crear la orden (no solo al pagar).
  - Default: `false`
  - Required: `false`
