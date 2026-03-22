# Image Upload for Products — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local image upload to the products form — file upload field replaces the URL text input, images auto-compress if >10MB, NestJS serves them statically.

**Architecture:** A new `UploadsModule` in NestJS handles `POST /v1/uploads/image`, processes the file with `sharp` (compress if >10MB, resize max 1200px), saves to `uploads/products/`, and returns a URL. `@nestjs/serve-static` serves the `uploads/` directory. The Astro products page gets a drag-and-drop file input that uploads immediately on select and shows a preview; a URL text field remains as fallback.

**Tech Stack:** NestJS, sharp, @nestjs/serve-static, multer (already bundled with @nestjs/platform-express), Astro

---

## Chunk 1: Backend — UploadsModule

### File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api-core/src/uploads/uploads.service.ts` | Create | Image processing + file persistence |
| `apps/api-core/src/uploads/uploads.service.spec.ts` | Create | Unit tests for UploadsService |
| `apps/api-core/src/uploads/uploads.controller.ts` | Create | HTTP endpoint `POST /image` |
| `apps/api-core/src/uploads/uploads.controller.spec.ts` | Create | Unit tests for UploadsController |
| `apps/api-core/src/uploads/uploads.module.ts` | Create | Module wiring |
| `apps/api-core/src/app.module.ts` | Modify | Register UploadsModule + ServeStaticModule |
| `apps/api-core/uploads/products/.gitkeep` | Create | Ensure uploads dir exists |
| `apps/api-core/.gitignore` | Modify | Ignore uploaded files, keep .gitkeep |

---

### Task 1: Install dependencies

- [ ] **Step 1: Install sharp and @nestjs/serve-static**

```bash
cd apps/api-core
pnpm add sharp @nestjs/serve-static
pnpm add -D @types/sharp
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('sharp'); console.log('sharp ok')"
```

Expected: `sharp ok`

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/package.json pnpm-lock.yaml
git commit -m "chore(api): install sharp and @nestjs/serve-static"
```

---

### Task 2: Create uploads directory

- [ ] **Step 1: Create directory and .gitkeep**

```bash
mkdir -p apps/api-core/uploads/products
touch apps/api-core/uploads/products/.gitkeep
```

- [ ] **Step 2: Update .gitignore to ignore uploaded files but keep .gitkeep**

In `apps/api-core/.gitignore`, add at the bottom:

```
# Uploaded files
uploads/**
!uploads/**/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/uploads/products/.gitkeep apps/api-core/.gitignore
git commit -m "chore(api): add uploads directory for product images"
```

---

### Task 3: UploadsService (TDD)

- [ ] **Step 1: Write failing tests**

Create `apps/api-core/src/uploads/uploads.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock sharp
jest.mock('sharp', () => {
  const mockInstance = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('compressed')),
  };
  return jest.fn(() => mockInstance);
});

// Mock fs
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const TEN_MB = 10 * 1024 * 1024;

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadsService],
    }).compile();
    service = module.get<UploadsService>(UploadsService);
  });

  describe('saveProductImage', () => {
    it('should return a URL path after saving', async () => {
      const file: Express.Multer.File = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(1024), // 1KB — small, no compression
        size: 1024,
      } as Express.Multer.File;

      const url = await service.saveProductImage(file);

      expect(url).toMatch(/^\/uploads\/products\/.+\.jpg$/);
    });

    it('should compress image when file is larger than 10MB', async () => {
      const sharp = require('sharp');
      const file: Express.Multer.File = {
        originalname: 'big-photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(TEN_MB + 1),
        size: TEN_MB + 1,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(sharp).toHaveBeenCalled();
      const instance = sharp.mock.results[0].value;
      expect(instance.resize).toHaveBeenCalledWith({ width: 1200, withoutEnlargement: true });
      expect(instance.jpeg).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should NOT compress image when file is 10MB or smaller', async () => {
      const sharp = require('sharp');
      const file: Express.Multer.File = {
        originalname: 'small-photo.png',
        mimetype: 'image/png',
        buffer: Buffer.alloc(TEN_MB),
        size: TEN_MB,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(sharp).not.toHaveBeenCalled();
    });

    it('should handle webp files', async () => {
      const sharp = require('sharp');
      const file: Express.Multer.File = {
        originalname: 'photo.webp',
        mimetype: 'image/webp',
        buffer: Buffer.alloc(TEN_MB + 1),
        size: TEN_MB + 1,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(sharp).toHaveBeenCalled();
      const instance = sharp.mock.results[0].value;
      expect(instance.webp).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should write the file to disk', async () => {
      const file: Express.Multer.File = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(1024),
        size: 1024,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(fs.writeFile).toHaveBeenCalled();
      const [writePath] = (fs.writeFile as jest.Mock).mock.calls[0];
      expect(writePath).toContain(path.join('uploads', 'products'));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api-core && pnpm test --testPathPattern=uploads.service
```

Expected: FAIL — `Cannot find module './uploads.service'`

- [ ] **Step 3: Implement UploadsService**

Create `apps/api-core/src/uploads/uploads.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';

const TEN_MB = 10 * 1024 * 1024;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');

@Injectable()
export class UploadsService {
  async saveProductImage(file: Express.Multer.File): Promise<string> {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const ext = this.getExtension(file.mimetype);
    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const buffer =
      file.size > TEN_MB
        ? await this.compress(file.buffer, file.mimetype)
        : file.buffer;

    await fs.writeFile(filePath, buffer);

    return `/uploads/products/${filename}`;
  }

  private async compress(buffer: Buffer, mimetype: string): Promise<Buffer> {
    const pipeline = sharp(buffer).resize({ width: 1200, withoutEnlargement: true });

    if (mimetype === 'image/webp') {
      return pipeline.webp({ quality: 80 }).toBuffer();
    }
    return pipeline.jpeg({ quality: 80 }).toBuffer();
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.jpg', // convert PNG to JPEG for consistency
      'image/webp': '.webp',
    };
    return map[mimetype] ?? '.jpg';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api-core && pnpm test --testPathPattern=uploads.service
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/
git commit -m "feat(api): add UploadsService with sharp auto-compression"
```

---

### Task 4: UploadsController (TDD)

- [ ] **Step 1: Write failing tests**

Create `apps/api-core/src/uploads/uploads.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

const mockUploadsService = {
  saveProductImage: jest.fn(),
};

describe('UploadsController', () => {
  let controller: UploadsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: mockUploadsService }],
    }).compile();
    controller = module.get<UploadsController>(UploadsController);
  });

  describe('uploadImage', () => {
    it('should return url from service', async () => {
      mockUploadsService.saveProductImage.mockResolvedValue('/uploads/products/abc.jpg');

      const file = { originalname: 'test.jpg', size: 1024, buffer: Buffer.from('') } as Express.Multer.File;
      const result = await controller.uploadImage(file);

      expect(result).toEqual({ url: '/uploads/products/abc.jpg' });
      expect(mockUploadsService.saveProductImage).toHaveBeenCalledWith(file);
    });

    it('should throw BadRequestException when no file provided', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      await expect(controller.uploadImage(undefined as any)).rejects.toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api-core && pnpm test --testPathPattern=uploads.controller
```

Expected: FAIL — `Cannot find module './uploads.controller'`

- [ ] **Step 3: Implement UploadsController**

Create `apps/api-core/src/uploads/uploads.controller.ts`:

```typescript
import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB raw limit
      fileFilter: (_req, file, cb) => {
        if (/image\/(jpeg|png|webp)/.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP'), false);
        }
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Debes subir un archivo de imagen');
    }
    const url = await this.uploadsService.saveProductImage(file);
    return { url };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api-core && pnpm test --testPathPattern=uploads.controller
```

Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/
git commit -m "feat(api): add UploadsController POST /uploads/image"
```

---

### Task 5: UploadsModule + AppModule registration

- [ ] **Step 1: Create UploadsModule**

Create `apps/api-core/src/uploads/uploads.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
```

- [ ] **Step 2: Register UploadsModule and ServeStaticModule in AppModule**

Modify `apps/api-core/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { ProductsModule } from './products/products.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { MenusModule } from './menus/menus.module';
import { OrdersModule } from './orders/orders.module';
import { CashRegisterModule } from './cash-register/cash-register.module';
import { KioskModule } from './kiosk/kiosk.module';
import { PrintModule } from './print/print.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    EventsModule,
    PrismaModule,
    RestaurantsModule,
    ProductsModule,
    MenusModule,
    OnboardingModule,
    UsersModule,
    EmailModule,
    AuthModule,
    OrdersModule,
    CashRegisterModule,
    KioskModule,
    PrintModule,
    KitchenModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
cd apps/api-core && pnpm test
```

Expected: All tests PASS

- [ ] **Step 4: Smoke test manually (API must be running)**

```bash
# Start the API
cd apps/api-core && pnpm dev

# In another terminal, upload a test image (requires a valid JWT token)
curl -X POST http://localhost:3000/v1/uploads/image \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/test.jpg"
# Expected: {"url":"/uploads/products/<uuid>.jpg"}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/uploads.module.ts apps/api-core/src/app.module.ts
git commit -m "feat(api): register UploadsModule and serve /uploads statically"
```

---

## Chunk 2: Frontend — Products Form

### File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/ui-dashboard/src/pages/dash/products.astro` | Modify | Replace URL text field with file upload + preview + tinypng link |

---

### Task 6: Update products.astro

- [ ] **Step 1: Replace the "URL de imagen" field in the form HTML**

In `apps/ui-dashboard/src/pages/dash/products.astro`, replace this block (lines 52–56):

```html
<div>
  <label class="block text-sm font-medium text-slate-700 mb-1">URL de imagen</label>
  <input type="text" id="productImageUrl"
    class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
</div>
```

With:

```html
<div class="md:col-span-2">
  <label class="block text-sm font-medium text-slate-700 mb-1">Imagen del producto</label>

  <!-- File upload area -->
  <div id="imageDropZone"
    class="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors mb-2"
    onclick="document.getElementById('productImageFile').click()">
    <input type="file" id="productImageFile" accept="image/jpeg,image/png,image/webp" class="hidden" />
    <p class="text-sm text-slate-500">
      Arrastra una imagen o <span class="text-indigo-600 font-medium">haz clic para seleccionar</span>
    </p>
    <p class="text-xs text-slate-400 mt-1">JPG, PNG, WEBP — si pesa más de 10 MB se comprime automáticamente</p>
  </div>

  <!-- TinyPNG recommendation -->
  <p class="text-xs text-blue-600 mb-2">
    💡 ¿Foto muy pesada?
    <a href="https://tinypng.com/" target="_blank" rel="noopener noreferrer" class="underline font-medium">
      Comprímela gratis en tinypng.com
    </a>
  </p>

  <!-- Upload preview (shown after file selected) -->
  <div id="imagePreview" class="hidden items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
    <img id="imagePreviewThumb" src="" alt="preview" class="w-16 h-16 object-cover rounded" />
    <div class="flex-1 min-w-0">
      <p id="imagePreviewName" class="text-sm font-medium text-slate-800 truncate"></p>
      <p id="imagePreviewStatus" class="text-xs text-slate-500 mt-0.5"></p>
    </div>
    <button type="button" id="imageClearBtn"
      class="text-red-500 hover:text-red-700 text-xs font-medium bg-transparent border-none cursor-pointer shrink-0">
      ✕ Quitar
    </button>
  </div>

  <!-- URL fallback (shown when no file selected) -->
  <div id="imageUrlFallback">
    <input type="text" id="productImageUrl" placeholder="O pega una URL externa de imagen"
      class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
  </div>
</div>
```

- [ ] **Step 2: Add image upload logic to the `<script>` section**

In the `<script>` block, after the `clearFormError` function definition (around line 120), add:

```typescript
// ---- Image upload ----
const imageFile = document.getElementById('productImageFile') as HTMLInputElement;
const imageDropZone = document.getElementById('imageDropZone')!;
const imagePreview = document.getElementById('imagePreview')!;
const imagePreviewThumb = document.getElementById('imagePreviewThumb') as HTMLImageElement;
const imagePreviewName = document.getElementById('imagePreviewName')!;
const imagePreviewStatus = document.getElementById('imagePreviewStatus')!;
const imageClearBtn = document.getElementById('imageClearBtn')!;
const imageUrlFallback = document.getElementById('imageUrlFallback')!;
let uploadedImageUrl: string | null = null;

imageFile.addEventListener('change', () => {
  const file = imageFile.files?.[0];
  if (file) handleImageSelected(file);
});

// Drag and drop support
imageDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageDropZone.classList.add('border-indigo-400', 'bg-indigo-50');
});
imageDropZone.addEventListener('dragleave', () => {
  imageDropZone.classList.remove('border-indigo-400', 'bg-indigo-50');
});
imageDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  imageDropZone.classList.remove('border-indigo-400', 'bg-indigo-50');
  const file = e.dataTransfer?.files[0];
  if (file) {
    // Set file to input so it behaves consistently
    const dt = new DataTransfer();
    dt.items.add(file);
    imageFile.files = dt.files;
    handleImageSelected(file);
  }
});

async function handleImageSelected(file: File) {
  // Show preview immediately with local blob URL
  const localUrl = URL.createObjectURL(file);
  imagePreviewThumb.src = localUrl;
  imagePreviewName.textContent = file.name;
  const sizeLabel = file.size > 10 * 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB — comprimiendo automáticamente...`
    : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  imagePreviewStatus.textContent = sizeLabel;
  imagePreview.classList.remove('hidden');
  imagePreview.classList.add('flex');
  imageUrlFallback.classList.add('hidden');
  uploadedImageUrl = null;

  // Upload to server
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await apiFetch('/v1/uploads/image', { method: 'POST', body: formData });
    if (res.ok) {
      const { url } = await res.json();
      uploadedImageUrl = url;
      imagePreviewStatus.textContent = `✓ Subida correctamente (${(file.size / 1024 / 1024).toFixed(1)} MB → optimizada)`;
      imagePreviewStatus.classList.add('text-green-600');
    } else {
      imagePreviewStatus.textContent = '⚠ Error al subir la imagen';
      imagePreviewStatus.classList.add('text-red-600');
    }
  } catch {
    imagePreviewStatus.textContent = '⚠ Error de conexión al subir';
    imagePreviewStatus.classList.add('text-red-600');
  }
}

function clearImageSelection() {
  imageFile.value = '';
  uploadedImageUrl = null;
  imagePreview.classList.add('hidden');
  imagePreview.classList.remove('flex');
  imageUrlFallback.classList.remove('hidden');
  imagePreviewThumb.src = '';
  imagePreviewStatus.className = 'text-xs text-slate-500 mt-0.5';
}

imageClearBtn.addEventListener('click', clearImageSelection);
// ---- End image upload ----
```

- [ ] **Step 3: Update apiFetch call for uploads (remove Content-Type header for FormData)**

Check `apps/ui-dashboard/src/lib/api.ts` — the `apiFetch` function likely sets `Content-Type: application/json` by default. Ensure FormData requests don't have that header overridden. If `apiFetch` always sets `Content-Type`, update it to skip setting the header when `body` is `FormData`:

```typescript
// In apiFetch, when building headers:
const headers: Record<string, string> = { ...defaultHeaders };
if (!(options?.body instanceof FormData)) {
  headers['Content-Type'] = 'application/json';
}
```

Read `apps/ui-dashboard/src/lib/api.ts` first to see exactly what needs changing.

- [ ] **Step 4: Update form submit to use uploadedImageUrl**

In the form submit handler, replace the line that reads `productImageUrl`:

Before:
```typescript
if (imageUrl) body.imageUrl = imageUrl;
```

After:
```typescript
const resolvedImageUrl = uploadedImageUrl || imageUrl;
if (resolvedImageUrl) body.imageUrl = resolvedImageUrl;
```

- [ ] **Step 5: Update editProduct handler to show existing image URL**

In `bindTableEvents`, inside the edit button click handler, after setting `categorySelect.value`, add:

```typescript
// Reset image upload state when editing
clearImageSelection();
const existingUrl = p.imageUrl || '';
(document.getElementById('productImageUrl') as HTMLInputElement).value = existingUrl;
```

- [ ] **Step 6: Update cancel and form reset to clear image state**

In the cancel button listener and after successful form submit, call `clearImageSelection()` alongside `formEl.reset()`.

- [ ] **Step 7: Manual test in browser**

1. Start API: `cd apps/api-core && pnpm dev`
2. Start dashboard: `cd apps/ui-dashboard && pnpm dev`
3. Open dashboard → Productos → Nuevo producto
4. Drag a large image (>10MB) → verify preview shows + status says "comprimiendo"
5. After upload: verify status shows "✓ Subida correctamente"
6. Save product → verify `imageUrl` is stored in DB
7. Edit product → verify existing URL shows in URL fallback field
8. Test URL fallback: don't select file, paste external URL → save → verify URL stored

- [ ] **Step 8: Commit**

```bash
git add apps/ui-dashboard/src/pages/dash/products.astro apps/ui-dashboard/src/lib/api.ts
git commit -m "feat(ui/products): replace URL field with file upload, auto-compress >10MB"
```

---

## Chunk 3: Final verification

### Task 7: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
cd apps/api-core && pnpm test
```

Expected: All tests PASS including the 7 new upload tests

- [ ] **Step 2: Verify static file serving**

```bash
# After uploading an image, verify it's accessible:
curl -I http://localhost:3000/uploads/products/<uuid>.jpg
# Expected: HTTP 200
```

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for image upload feature"
```
