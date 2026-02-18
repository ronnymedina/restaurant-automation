# Variables de Entorno

### APLICACION

* **PORT**: Puerto de la aplicacion.
  - Default: `3000`
  - Required: `false`

* **DATABASE_URL**: URL de conexion a la base de datos.
  - Default: `file:./dev.db`
  - Required: `true`

* **NODE_ENV**: Entorno (development, production, test).
  - Default: `development`
  - Required: `false`

### AUTH / JWT

- **JWT_SECRET**: Clave secreta para firmar tokens JWT.
  - Default: ninguno
  - Required: `true`

- **JWT_ACCESS_EXPIRATION**: Tiempo de expiracion del access token.
  - Default: `15m`
  - Required: `false`

- **JWT_REFRESH_EXPIRATION**: Tiempo de expiracion del refresh token.
  - Default: `7d`
  - Required: `false`

### AI MODULE

- **GEMINI_API_KEY**: API key para Gemini AI.
  - Default: `""` (vacio)
  - Required: `false`

- **GEMINI_MODEL**: Modelo a usar para Gemini AI.
  - Default: `""` (vacio)
  - Required: `false` (requerido si GEMINI_API_KEY esta configurado)

### ONBOARDING MODULE

- **MAX_FILE_SIZE_MB**: Tamano maximo por foto en MB.
  - Default: `5`
  - Required: `false`

- **MAX_FILES**: Cantidad maxima de fotos a subir.
  - Default: `3`
  - Required: `false`

### PRODUCTS MODULE

- **BATCH_SIZE**: Tamano de lote para la creacion de productos.
  - Default: `10`
  - Required: `false`

- **DEFAULT_PAGE_SIZE**: Cantidad de items por pagina en listados paginados.
  - Default: `10`
  - Required: `false`

### FRONTEND

- **FRONTEND_URL**: URL del frontend.
  - Default: `http://localhost:4321`
  - Required: `false`

### USERS / EMAIL MODULE

- **RESEND_API_KEY**: API Key de Resend para envio de correos.
  - Default: `""` (vacio)
  - Required: `false`

- **EMAIL_FROM**: Direccion de correo remitente.
  - Default: `onboarding@resend.dev`
  - Required: `false`

- **BCRYPT_SALT_ROUNDS**: Costo de hashing para contrasenas.
  - Default: `10`
  - Required: `false`
