### Upload (uploads)

### Respuesta serializada

**POST /v1/uploads/image** retorna:

```json
{ "url": "string" }
```

En modo `local`: `url` es un path relativo (`/uploads/products/{uuid}.{ext}`), servido como estático.
En modo `r2`: `url` es una URL pública de Cloudflare R2 (`{UPLOAD_CF_R2_PUBLIC_URL}/products/{uuid}.{ext}`).

### Endpoints

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `POST` | `/v1/uploads/image` | ADMIN, MANAGER | `{ url: string }` | Subir imagen de producto |

---

#### Upload Image — `POST /v1/uploads/image`

E2E: ✅ `test/uploads/uploadImage.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta subir | 403 | Solo ADMIN o MANAGER |
| ADMIN sube JPG | 201 | Retorna `{ url }` |
| MANAGER sube PNG | 201 | Retorna `{ url }` |
| ADMIN sube WEBP | 201 | Retorna `{ url }` |
| Sin archivo | 400 | `Debes subir un archivo de imagen` |
| Tipo no permitido (ej. PDF) | 400 | `Solo se permiten imágenes JPG, PNG o WEBP` |
| Archivo mayor a 2MB | 413 | Multer rechaza por `limits.fileSize` |

---

### Configuración

| Variable | Descripción | Default |
|---|---|---|
| `UPLOAD_STORAGE` | `local` o `r2` | `local` |
| `UPLOADS_PATH` | Carpeta local para imágenes | `{cwd}/uploads` |
| `UPLOAD_CF_R2_ACCOUNT_ID` | Account ID de Cloudflare R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_ACCESS_KEY_ID` | Access Key ID de R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_SECRET_ACCESS_KEY` | Secret Access Key de R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_BUCKET_NAME` | Nombre del bucket R2 | — (requerido si `r2`) |
| `UPLOAD_CF_R2_PUBLIC_URL` | URL pública del bucket (CDN) | — (requerido si `r2`) |

Si `UPLOAD_STORAGE=r2` y alguna variable de R2 está ausente, la app falla en startup con error descriptivo.

---

### Notas de implementación

- El `restaurantId` del JWT **no** se usa aquí — uploads es un endpoint genérico de imágenes
- Límite de tamaño: **2MB** por archivo (multer `limits.fileSize`)
- Tipos permitidos: `image/jpeg`, `image/png`, `image/webp` — validado por MIME type del header HTTP
- El filename en disco/storage se genera con `crypto.randomUUID()` — sin riesgo de path traversal
- **Modo local:** archivos en `{UPLOADS_PATH}/products/{uuid}.{ext}`, retorna path relativo
- **Modo R2:** `PutObjectCommand` vía `@aws-sdk/client-s3` (R2 es S3-compatible), retorna URL pública del CDN

### Limitaciones conocidas

- **MIME spoofing:** la validación de tipo usa `file.mimetype`, que viene del header HTTP y puede ser falsificado por el cliente. La verificación de magic bytes del buffer (usando `sharp.metadata()` o la librería `file-type`) queda pendiente como mejora de seguridad futura.

### Providers

| Clase | Condición de uso | URL retornada |
|---|---|---|
| `LocalStorageProvider` | `UPLOAD_STORAGE=local` (default) | `/uploads/products/{uuid}.{ext}` |
| `R2StorageProvider` | `UPLOAD_STORAGE=r2` | `{UPLOAD_CF_R2_PUBLIC_URL}/products/{uuid}.{ext}` |

### Tests existentes

| Tipo | Archivo | Cobertura |
|---|---|---|
| Unit (service) | `src/uploads/uploads.service.spec.ts` | ✅ 4 tests |
| Unit (controller) | `src/uploads/uploads.controller.spec.ts` | ✅ 2 tests |
| Unit (local provider) | `src/uploads/providers/local-storage.provider.spec.ts` | ✅ 3 tests |
| Unit (R2 provider) | `src/uploads/providers/r2-storage.provider.spec.ts` | ✅ 3 tests |
| E2E | `test/uploads/uploadImage.e2e-spec.ts` | ✅ 8 tests |
