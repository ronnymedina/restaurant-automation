# Spec: Secure Image Upload with Presigned URLs

**Date:** 2026-04-18  
**Status:** Approved

## Problem

The current upload flow sends the image file to the backend, which then uploads it to Cloudflare R2 using server-side credentials. This works but has two problems:

1. **No tenant isolation** — all images land in `products/{uuid}.ext`, with no `restaurantId` separation. Restaurant A could theoretically overwrite Restaurant B's images.
2. **Not scalable for web** — routing large files through the backend wastes bandwidth and compute. The secure standard for object storage is presigned URLs: the backend authorizes the upload, the browser uploads directly.

Local/Electron mode must still work without R2.

## Goal

A unified two-step upload API that works identically from the frontend regardless of storage backend:

1. `POST /v1/uploads/presign` — backend authenticates the user, generates a short-lived upload authorization, returns `{ presignedUrl, publicUrl }`.
2. `PUT {presignedUrl}` — frontend uploads the raw file directly (to R2 or to a local backend endpoint).

No frontend env vars needed. No frontend branching logic.

## Architecture

### Storage path

All images are stored under a per-restaurant prefix:

```
restaurants/{restaurantId}/{uuid}.ext
```

Examples:
- R2: `https://images.example.com/restaurants/abc-123/9f2e...jpg`
- Local: `/uploads/restaurants/abc-123/9f2e...jpg`

### StorageProvider interface

Add a second method alongside the existing `save()`:

```typescript
export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimetype: string): Promise<string>;
  getPresignedUpload(key: string, mimetype: string, expiresInSeconds: number): Promise<{
    presignedUrl: string;
    publicUrl: string;
  }>;
}
```

### R2StorageProvider

Install `@aws-sdk/s3-request-presigner`. Implement `getPresignedUpload` using `getSignedUrl` + `PutObjectCommand`:

- Key passed in: `restaurants/{restaurantId}/{uuid}.ext`
- Signed URL allows only `PUT` with the exact `Content-Type`
- Expiry: `expiresInSeconds` (from config)
- `publicUrl`: `{UPLOAD_CF_R2_PUBLIC_URL}/{key}`

### LocalStorageProvider

No presigned URL capability from Cloudflare. Instead, generate a short-lived signed JWT containing:

```json
{ "key": "restaurants/{restaurantId}/{uuid}.ext", "publicUrl": "/uploads/restaurants/...", "exp": ... }
```

- Signed with `JWT_SECRET`
- `presignedUrl`: `{API_BASE_URL}/v1/uploads/local-put/{token}`
- `publicUrl`: `/uploads/{key}`

### New backend endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/uploads/presign` | JWT (ADMIN, MANAGER) | Generate presigned upload URL |
| `PUT` | `/v1/uploads/local-put/:token` | Signed token (no JWT) | Accept raw file body, save to disk (local mode only) |

**`POST /v1/uploads/presign`**  
Request body: `{ mimetype: 'image/jpeg' | 'image/png' | 'image/webp' }`  
Response: `{ presignedUrl: string, publicUrl: string }`  
The `restaurantId` is read from the JWT payload — no user input.

**`PUT /v1/uploads/local-put/:token`**  
- Validates JWT token (checks `exp`, `key`, `publicUrl` fields)
- Reads raw `body` stream, saves to `{UPLOADS_PATH}/{key}`
- Creates directories if needed
- Returns `200 OK` on success
- In R2 mode: route is not registered → returns `404` naturally

### UploadsService

New method:

```typescript
async getPresignedUpload(restaurantId: string, mimetype: string): Promise<{ presignedUrl: string; publicUrl: string }>
```

1. Validates `mimetype` is one of `image/jpeg`, `image/png`, `image/webp`
2. Builds key: `restaurants/${restaurantId}/${crypto.randomUUID()}${ext}`
3. Delegates to `storageProvider.getPresignedUpload(key, mimetype, expiresInSeconds)`

### Configuration

New env vars in `apps/api-core`:

| Variable | Description | Default |
|----------|-------------|---------|
| `UPLOAD_PRESIGN_EXPIRY_SECONDS` | Presigned URL expiry in seconds | `120` |
| `API_BASE_URL` | Used to build local-put URLs in local mode | `http://localhost:3000` |

Both added to `apps/api-core/src/config.ts` and `uploads.config.ts`.

## Frontend changes

### `apps/ui/src/lib/products-api.ts`

Replace the current `uploadImage()` with the two-step flow:

```typescript
export async function uploadImage(file: File): Promise<string> {
  const presignRes = await apiFetch('/v1/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ mimetype: file.type }),
  });
  if (!presignRes.ok) throw new Error('Error al obtener URL de subida');
  const { presignedUrl, publicUrl } = await presignRes.json();

  const putRes = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!putRes.ok) throw new Error('Error al subir la imagen');

  return publicUrl;
}
```

`ProductForm.tsx` requires no changes — it already handles `uploading` / `done` / `error` states.

## CORS configuration (Cloudflare R2 — manual step)

In the Cloudflare dashboard → R2 bucket → Settings → CORS:

```json
[
  {
    "AllowedOrigins": ["https://your-dashboard-domain.com", "http://localhost:4321"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"]
  }
]
```

This is a one-time manual setup, not managed by code.

## What stays the same

- `POST /v1/uploads/image` — kept as-is for the onboarding flow (backend-to-backend via Multer, no frontend involved).
- `LocalStorageProvider.save()` and `R2StorageProvider.save()` — unchanged.
- `ProductForm.tsx` — no UI changes.

## Out of scope

- Magic byte validation (MIME spoofing prevention) — documented as known limitation, deferred.
- Automatic image compression on the backend.
- Signed URL rotation or revocation.

## Testing

| Layer | What to cover |
|-------|---------------|
| Unit — `UploadsService` | `getPresignedUpload` builds correct key, validates mimetype, rejects invalid types |
| Unit — `R2StorageProvider` | `getPresignedUpload` calls `getSignedUrl` with correct params |
| Unit — `LocalStorageProvider` | `getPresignedUpload` returns valid JWT token and correct URLs |
| Unit — `UploadsController` | presign endpoint returns 200 with `{ presignedUrl, publicUrl }`; local-put validates token |
| E2E — presign | ADMIN/MANAGER get presigned URL; BASIC gets 403; unauthenticated gets 401 |
| E2E — local-put | Valid token + file → 200; expired token → 401; invalid token → 401 |
