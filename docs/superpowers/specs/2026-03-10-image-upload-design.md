# Image Upload for Products — Design Spec

**Date:** 2026-03-10
**Status:** Approved

## Summary

Replace the "URL de imagen" text field in the products form with a file upload field. Images are uploaded immediately on selection, auto-optimized if >10MB, and served locally by NestJS. A URL text field remains as fallback for external URLs.

## Frontend (products.astro)

- Replace the `<input type="text" id="productImageUrl">` with a drag-and-drop file upload area.
- Accepted formats: JPG, PNG, WEBP.
- On file selection: immediately `POST /v1/uploads/image` with the file.
- Show upload progress/state and a preview thumbnail.
- If the image was compressed, show original vs. compressed size.
- On success: store the returned URL internally; hide the URL fallback field.
- Add a "remove" button to clear the selected file and restore the URL fallback.
- Show a TinyPNG recommendation link: `https://tinypng.com/` (always visible).
- URL fallback: a text input shown when no file is selected, for pasting external URLs.
- On form submit: use the uploaded URL or the manually entered URL as `imageUrl`.

## Backend — UploadsModule (NestJS)

### Endpoint

`POST /v1/uploads/image`

- Auth: requires valid session (same guard as other protected routes).
- Input: `multipart/form-data`, field name `file`.
- Validation: JPG, PNG, WEBP only; max raw size 50MB (multer limit).
- Processing with `sharp`:
  - If file size > 10MB: compress (JPEG quality 80, or WebP quality 80).
  - Always resize to max 1200px width (preserve aspect ratio).
  - Output format: JPEG for JPG/PNG, WebP for WebP inputs.
- Save to: `<project-root>/uploads/products/<uuid>.<ext>`
- Response: `{ url: "/uploads/products/<uuid>.<ext>" }`

### Static File Serving

- Install `@nestjs/serve-static`.
- Serve the `uploads/` directory at root path `/uploads`.
- Access pattern: `http://localhost:3000/uploads/products/abc.jpg`

### New files

- `apps/api-core/src/uploads/uploads.module.ts`
- `apps/api-core/src/uploads/uploads.controller.ts`
- `apps/api-core/src/uploads/uploads.service.ts`
- `apps/api-core/uploads/products/` (gitignored directory)

## Data Flow

1. User selects file → `POST /v1/uploads/image` → sharp compresses if >10MB → saved to disk → URL returned.
2. Frontend shows preview + URL stored internally.
3. User submits product form → `POST/PATCH /v1/products` with `imageUrl` already set.
4. If no file selected: user can paste external URL manually.

## Dependencies to Add

- `sharp` — image processing/compression
- `@nestjs/serve-static` — static file serving
- `uuid` — already available (check); if not, use `crypto.randomUUID()`

## Out of Scope

- CDN or cloud storage (S3, Cloudinary) — out of scope for local system.
- Image deletion when product is deleted — not required now.
- Multiple images per product — single image only.
