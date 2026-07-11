# Uploads Module — Design Spec

**Date:** 2026-04-14  
**Branch:** restaurante-verifications  
**Status:** Approved

---

## Context

The uploads module exposes `POST /v1/uploads/image` to store product images. It currently saves files to disk locally using a flat service with no storage abstraction, no role restriction, an excessive 50MB limit, and compression logic that is no longer needed. This spec redesigns the module to support dual storage (local disk and Cloudflare R2), harden security, and clean up removed features.

---

## Goals

- Dual storage: local disk for development/desktop, Cloudflare R2 for web/production
- Switch mode via `UPLOAD_STORAGE` environment variable
- Restrict uploads to ADMIN and MANAGER roles
- Enforce 2MB file size limit
- Remove compression (no active clients; deferred to client or external process)
- Validate MIME type (header-based; magic bytes deferred — documented as known limitation)
- E2E test coverage following existing patterns
- `uploads.module.info.md` documentation file

---

## Architecture

### Strategy Pattern — `StorageProvider`

```
src/uploads/
├── uploads.module.ts
├── uploads.controller.ts
├── uploads.service.ts
├── providers/
│   ├── storage-provider.interface.ts
│   ├── local-storage.provider.ts
│   └── r2-storage.provider.ts
└── uploads.module.info.md
```

The module selects the provider at bootstrap:

```ts
{
  provide: STORAGE_PROVIDER,
  useClass: UPLOAD_STORAGE === 'r2' ? R2StorageProvider : LocalStorageProvider,
}
```

`UploadsService` receives `@Inject(STORAGE_PROVIDER)` and calls `provider.save(buffer, filename, mimetype)` without knowing which implementation is active.

---

## Configuration

Added to `src/config.ts`:

```ts
// uploads
export const UPLOAD_STORAGE = process.env.UPLOAD_STORAGE || 'local'; // 'local' | 'r2'

// Cloudflare R2 — required only if UPLOAD_STORAGE=r2
export const CF_R2_ACCOUNT_ID        = process.env.CF_R2_ACCOUNT_ID        || '';
export const CF_R2_ACCESS_KEY_ID     = process.env.CF_R2_ACCESS_KEY_ID     || '';
export const CF_R2_SECRET_ACCESS_KEY = process.env.CF_R2_SECRET_ACCESS_KEY || '';
export const CF_R2_BUCKET_NAME       = process.env.CF_R2_BUCKET_NAME       || '';
export const CF_R2_PUBLIC_URL        = process.env.CF_R2_PUBLIC_URL        || '';
```

**`UPLOADS_PATH`** (already in config) controls the local folder. `LocalStorageProvider` saves to `{UPLOADS_PATH}/products/`. Defaults to `{cwd}/uploads` if not set.

**Startup validation:** if `UPLOAD_STORAGE=r2`, the module verifies all 5 R2 variables are present and throws on startup if any is missing — same pattern as `requireEnv` used for `JWT_SECRET`.

---

## Controller

```ts
@Post('image')
@Roles(Role.ADMIN, Role.MANAGER)
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB hard limit
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP'), false);
    }
  },
}))
async uploadImage(@UploadedFile() file: Express.Multer.File): Promise<{ url: string }>
```

### Security changes vs current state

| Issue | Fix |
|---|---|
| Any authenticated role could upload | `@Roles(ADMIN, MANAGER)` + `RolesGuard` |
| 50MB raw limit | Reduced to 2MB |
| Compression logic in hot path | Removed entirely |
| MIME validation only (magic bytes not checked) | Documented as known limitation in `.info.md` |

---

## Storage Providers

### Interface

```ts
export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimetype: string): Promise<string>;
}
```

### LocalStorageProvider

- Saves buffer to `{UPLOADS_PATH}/products/{uuid}.{ext}`
- Returns `/uploads/products/{uuid}.{ext}` (served as static)
- Creates directory recursively if missing

### R2StorageProvider

- Uses `@aws-sdk/client-s3` with `PutObjectCommand` (R2 is S3-compatible)
- Endpoint: `https://{CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- Key: `products/{uuid}.{ext}`
- Returns `{CF_R2_PUBLIC_URL}/products/{uuid}.{ext}`
- On S3 error: throws `InternalServerErrorException`

### UploadsService

```ts
async saveProductImage(file: Express.Multer.File): Promise<string> {
  const ext = this.getExtension(file.mimetype);
  const filename = `${crypto.randomUUID()}${ext}`;
  return this.storageProvider.save(file.buffer, filename, file.mimetype);
}
```

---

## Tests

### E2E — `test/uploads/uploadImage.e2e-spec.ts`

Always runs against `LocalStorageProvider`. R2 is never called in E2E.

| Case | Status | Detail |
|---|---|---|
| No token | 401 | Unauthenticated |
| BASIC tries to upload | 403 | ADMIN/MANAGER only |
| ADMIN uploads valid JPG | 201 | Returns `{ url }` |
| MANAGER uploads valid PNG | 201 | Returns `{ url }` |
| ADMIN uploads valid WEBP | 201 | Returns `{ url }` |
| No file sent | 400 | `Debes subir un archivo de imagen` |
| Disallowed type (PDF) | 400 | `Solo se permiten imágenes JPG, PNG o WEBP` |
| File over 2MB | 400 | Multer rejects via `limits.fileSize` |

### Unit tests updated

- `uploads.service.spec.ts` — mocks `StorageProvider` token; removes compression cases
- `uploads.controller.spec.ts` — adds 403 case for BASIC role
- `r2-storage.provider.spec.ts` — unit test with mocked S3 client (`@aws-sdk/client-s3`)

---

## Known Limitations

- **MIME type validation is header-based.** `file.mimetype` is sent by the client and can be spoofed. A malicious user could rename a non-image file with a `.jpg` extension and set the correct MIME type. Magic bytes verification (using `sharp.metadata()` or `file-type`) is a future improvement — documented in `uploads.module.info.md`.

---

## Dependencies

New package required:

```
@aws-sdk/client-s3
```

Only the `S3Client` and `PutObjectCommand` are used. No other AWS SDK packages needed.
