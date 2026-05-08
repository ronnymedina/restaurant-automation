### Upload (uploads)

## Flujo de subida (a partir de 2026-04-18)

El frontend siempre usa un flujo de dos pasos, idéntico en modo local y web:

1. **`POST /v1/uploads/presign`** — autenticado con JWT. El backend genera una URL temporal (`presignedUrl`) y la URL pública final (`publicUrl`).
2. **`PUT {presignedUrl}`** — el frontend sube el archivo raw directamente a esa URL (a R2 o al endpoint local).

**En modo R2:** `presignedUrl` es una URL firmada de Cloudflare R2 (válida `UPLOAD_PRESIGN_EXPIRY_SECONDS` segundos). El archivo se sube directo a R2 desde el navegador.

**En modo local:** `presignedUrl` apunta a `{API_BASE_URL}/v1/uploads/local-put/{token}`. El token es un JWT firmado con `JWT_SECRET` que contiene el path de destino. El backend recibe el raw body y guarda en disco.

### Organización de paths

Todos los archivos se guardan bajo `restaurants/{restaurantId}/{uuid}.ext`:

- **R2:** `{UPLOAD_CF_R2_PUBLIC_URL}/restaurants/{restaurantId}/{uuid}.jpg`
- **Local:** `/uploads/restaurants/{restaurantId}/{uuid}.jpg`

### Endpoints

| Método | Ruta | Auth | Roles | Descripción |
|--------|------|------|-------|-------------|
| `POST` | `/v1/uploads/image` | JWT | ADMIN, MANAGER | Subida legacy (onboarding/backend). No afectado por el nuevo flujo. |
| `POST` | `/v1/uploads/presign` | JWT | ADMIN, MANAGER | Generar presigned URL |
| `PUT` | `/v1/uploads/local-put/:token` | Token JWT en URL | — | Recibir imagen en modo local |

---

#### POST /v1/uploads/presign

**Request body:**
```json
{ "mimetype": "image/jpeg" }
```
Valores permitidos: `image/jpeg`, `image/png`, `image/webp`.

**Response:**
```json
{
  "presignedUrl": "https://... o http://localhost:3000/v1/uploads/local-put/{token}",
  "publicUrl": "/uploads/restaurants/{restaurantId}/{uuid}.jpg"
}
```

**Casos cubiertos por e2e:**

| Caso | Status |
|------|--------|
| Sin token | 401 |
| BASIC intenta acceder | 403 |
| ADMIN con mimetype válido | 201 |
| Token contiene key con restaurantId correcto | ✓ |
| mimetype no soportado (ej. PDF) | 400 |

---

#### PUT /v1/uploads/local-put/:token

Solo activo en modo local (`UPLOAD_STORAGE=local`). En modo R2 este endpoint no existe.

Recibe raw body con `Content-Type: image/*`. Valida el JWT en el path param, crea el directorio y guarda el archivo.

**Casos cubiertos por e2e:**

| Caso | Status |
|------|--------|
| Token válido + imagen | 204 |
| Token expirado | 401 |
| Token inválido/tampered | 401 |
| Sin JWT de sesión (es público) | 204 ✓ |

---

### Configuración

| Variable | Descripción | Default |
|----------|-------------|---------|
| `UPLOAD_STORAGE` | `local` o `r2` | `local` |
| `UPLOADS_PATH` | Carpeta local para imágenes | `{cwd}/uploads` |
| `UPLOAD_PRESIGN_EXPIRY_SECONDS` | Expiración de presigned URLs en segundos | `120` |
| `API_BASE_URL` | URL base del API, usada para construir URLs locales | `http://localhost:3000` |
| `UPLOAD_CF_R2_ACCOUNT_ID` | Account ID de Cloudflare R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_ACCESS_KEY_ID` | Access Key ID de R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_SECRET_ACCESS_KEY` | Secret Access Key de R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_BUCKET_NAME` | Nombre del bucket R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_PUBLIC_URL` | URL pública del bucket (CDN) | — (requerido si `r2`) |

### Configuración CORS en R2 (manual, una sola vez)

En el panel de Cloudflare → R2 bucket → Settings → CORS:

```json
[
  {
    "AllowedOrigins": ["https://tu-dominio.com", "http://localhost:4321"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"]
  }
]
```

### Configuración del token R2 en Cloudflare (producción)

**Tipo de token:** Account API Token (no User API Token)
- Permanece activo aunque el usuario abandone la organización
- Recomendado por Cloudflare para sistemas en producción

**Permisos:** Object Read & Write
- Cloudflare no ofrece "Object Write only" como opción
- Dado que los archivos son públicos vía CDN, el permiso de lectura en el token no representa riesgo adicional

**Scope de buckets:** Apply to specific buckets only → nombre del bucket
- No aplicar a todos los buckets para limitar el blast radius si el token se compromete

**IP Filter:** vacío
- Railway no garantiza IPs de salida estáticas; restringir por IP rompería el servicio en cada redeploy

---

### URL pública del bucket (UPLOAD_CF_R2_PUBLIC_URL)

**No usar el subdominio `.r2.dev`** para producción:
- Está rate-limited
- No soporta caché ni Cloudflare Access

**Usar un custom domain:**
1. En el bucket → Settings → Public access → Connect custom domain
2. Escribir el subdominio deseado (ej: `res-storage.daikulab.com`)
3. Cloudflare crea el registro DNS y el certificado SSL automáticamente
4. Usar esa URL como `UPLOAD_CF_R2_PUBLIC_URL`

---

### Providers

| Clase | Condición | presignedUrl retornada | publicUrl retornada |
|-------|-----------|------------------------|---------------------|
| `LocalStorageProvider` | `UPLOAD_STORAGE=local` | `{API_BASE_URL}/v1/uploads/local-put/{jwt}` | `/uploads/restaurants/{restaurantId}/{uuid}.ext` |
| `R2StorageProvider` | `UPLOAD_STORAGE=r2` | URL firmada de Cloudflare R2 | `{UPLOAD_CF_R2_PUBLIC_URL}/restaurants/{restaurantId}/{uuid}.ext` |

### Nota técnica: middleware raw body

`express.raw({ type: 'image/*' })` se aplica vía `MiddlewareConsumer.forRoutes(UploadsController)`.
Usar la clase del controlador (en lugar de un path string) es necesario para que NestJS
resuelva correctamente el path versionado `/v1/uploads/local-put/:token` con URI versioning.

### Tests

| Tipo | Archivo | Tests |
|------|---------|-------|
| Unit (service) | `src/uploads/uploads.service.spec.ts` | 12 |
| Unit (controller) | `src/uploads/uploads.controller.spec.ts` | 4 |
| Unit (local provider) | `src/uploads/providers/local-storage.provider.spec.ts` | 7 |
| Unit (R2 provider) | `src/uploads/providers/r2-storage.provider.spec.ts` | 6 |
| E2E (imagen legacy) | `test/uploads/uploadImage.e2e-spec.ts` | 8 |
| E2E (presign flow) | `test/uploads/presign.e2e-spec.ts` | 9 |

### Limitaciones conocidas

- **MIME spoofing:** validación usa `Content-Type` header (puede falsificarse). Verificación de magic bytes pendiente.
- El endpoint `POST /v1/uploads/image` (flujo legacy) no usa aislamiento por `restaurantId` — sigue guardando en `products/{uuid}.ext`.
