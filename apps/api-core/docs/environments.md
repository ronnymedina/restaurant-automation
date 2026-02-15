# Variables de Entorno

### APLICACIÓN

* **PORT**: Puerto de la aplicación.
  - Default: `3000`
  - Required: `false`

* **DATABASE_URL**: URL de conexión a la base de datos.
  - Default: `file:./dev.db`
  - Required: `true`

* **NODE_ENV**: Entorno (development, production, test).
  - Default: `development`
  - Required: `false`

### AI MODULE

- **GEMINI_API_KEY**: API key para Gemini AI.
  - Default: `""` (vacío)
  - Required: `false`

- **GEMINI_MODEL**: Modelo a usar para Gemini AI.
  - Default: `""` (vacío)
  - Required: `false` (requerido si GEMINI_API_KEY está configurado)

### ONBOARDING MODULE

- **MAX_FILE_SIZE_MB**: Tamaño máximo por foto en MB.
  - Default: `5`
  - Required: `false`

- **MAX_FILES**: Cantidad máxima de fotos a subir.
  - Default: `3`
  - Required: `false`


### PRODUCTS MODULE

- **BATCH_SIZE**: Tamaño de lote para la creación de productos.
  - Default: `10`
  - Required: `false`

### FRONTEND

- **FRONTEND_URL**: URL del frontend.
  - Default: `http://localhost:4321`
  - Required: `false`

### USERS MODULE

- **RESEND_API_KEY**: API Key de Resend para envío de correos.
  - Default: `""` (vacío)
  - Required: `false`

- **EMAIL_FROM**: Dirección de correo remitente.
  - Default: `onboarding@resend.dev`
  - Required: `false`

- **BCRYPT_SALT_ROUNDS**: Costo de hashing para contraseñas.
  - Default: `10`
  - Required: `false`
