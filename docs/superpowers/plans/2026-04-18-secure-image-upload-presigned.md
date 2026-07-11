# Secure Image Upload — Presigned URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend direct-upload flow with a unified two-step presigned URL approach that works transparently in both R2 (web) and local/Electron modes, adding per-restaurant path isolation.

**Architecture:** Backend exposes `POST /v1/uploads/presign` (JWT-authenticated) that returns `{ presignedUrl, publicUrl }`. In R2 mode, the presigned URL is a real Cloudflare R2 signed URL. In local mode, it's a short-lived JWT-signed local endpoint `PUT /v1/uploads/local-put/:token`. The frontend always uses the same two-step flow regardless of mode. Images are stored under `restaurants/{restaurantId}/{uuid}.ext`.

**Tech Stack:** NestJS, `@aws-sdk/s3-request-presigner` (new), `jsonwebtoken` (new explicit dep), express middleware, React/TypeScript (UI)

---

## File Map

| Action | File |
|--------|------|
| Modify | `apps/api-core/src/config.ts` |
| Modify | `apps/api-core/src/uploads/uploads.config.ts` |
| Modify | `apps/api-core/src/uploads/uploads.module.ts` |
| Modify | `apps/api-core/src/uploads/providers/storage-provider.interface.ts` |
| Modify | `apps/api-core/src/uploads/providers/r2-storage.provider.ts` |
| Modify | `apps/api-core/src/uploads/providers/local-storage.provider.ts` |
| Modify | `apps/api-core/src/uploads/uploads.service.ts` |
| Modify | `apps/api-core/src/uploads/uploads.controller.ts` |
| Modify | `apps/api-core/src/uploads/exceptions/uploads.exceptions.ts` |
| Create | `apps/api-core/src/uploads/dto/presign-upload.dto.ts` |
| Modify | `apps/api-core/src/uploads/providers/r2-storage.provider.spec.ts` |
| Modify | `apps/api-core/src/uploads/providers/local-storage.provider.spec.ts` |
| Modify | `apps/api-core/src/uploads/uploads.service.spec.ts` |
| Modify | `apps/api-core/src/uploads/uploads.controller.spec.ts` |
| Create | `apps/api-core/test/uploads/presign.e2e-spec.ts` |
| Modify | `apps/ui/src/lib/products-api.ts` |
| Modify | `apps/api-core/src/uploads/uploads.module.info.md` |

---

## Task 1: Install packages and extend config

**Files:**
- Modify: `apps/api-core/package.json` (via pnpm)
- Modify: `apps/api-core/src/config.ts`
- Modify: `apps/api-core/src/uploads/uploads.config.ts`

- [ ] **Step 1: Install new packages**

```bash
cd apps/api-core
pnpm add @aws-sdk/s3-request-presigner jsonwebtoken
pnpm add -D @types/jsonwebtoken
```

Expected: packages added to `package.json`, no errors.

- [ ] **Step 2: Add new env vars to `apps/api-core/src/config.ts`**

Add after the existing R2 config block:

```typescript
// uploads — presign
export const UPLOAD_PRESIGN_EXPIRY_SECONDS = Number(process.env.UPLOAD_PRESIGN_EXPIRY_SECONDS) || 120;
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
```

- [ ] **Step 3: Update `apps/api-core/src/uploads/uploads.config.ts`**

Replace the full file content:

```typescript
import { registerAs } from '@nestjs/config';
import {
  UPLOAD_STORAGE,
  UPLOADS_PATH,
  UPLOAD_CF_R2_ACCOUNT_ID,
  UPLOAD_CF_R2_ACCESS_KEY_ID,
  UPLOAD_CF_R2_SECRET_ACCESS_KEY,
  UPLOAD_CF_R2_BUCKET_NAME,
  UPLOAD_CF_R2_PUBLIC_URL,
  UPLOAD_PRESIGN_EXPIRY_SECONDS,
  API_BASE_URL,
  JWT_SECRET,
} from '../config';

export const uploadsConfig = registerAs('uploads', () => ({
  uploadStorage: UPLOAD_STORAGE,
  uploadsPath: UPLOADS_PATH,
  cfR2AccountId: UPLOAD_CF_R2_ACCOUNT_ID,
  cfR2AccessKeyId: UPLOAD_CF_R2_ACCESS_KEY_ID,
  cfR2SecretAccessKey: UPLOAD_CF_R2_SECRET_ACCESS_KEY,
  cfR2BucketName: UPLOAD_CF_R2_BUCKET_NAME,
  cfR2PublicUrl: UPLOAD_CF_R2_PUBLIC_URL,
  presignExpirySeconds: UPLOAD_PRESIGN_EXPIRY_SECONDS,
  apiBaseUrl: API_BASE_URL,
  jwtSecret: JWT_SECRET,
}));
```

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/package.json apps/api-core/pnpm-lock.yaml \
  apps/api-core/src/config.ts apps/api-core/src/uploads/uploads.config.ts
git commit -m "chore(uploads): add presign deps and config vars"
```

---

## Task 2: Extend StorageProvider interface and add exceptions

**Files:**
- Modify: `apps/api-core/src/uploads/providers/storage-provider.interface.ts`
- Modify: `apps/api-core/src/uploads/exceptions/uploads.exceptions.ts`
- Create: `apps/api-core/src/uploads/dto/presign-upload.dto.ts`

- [ ] **Step 1: Update the StorageProvider interface**

Replace `apps/api-core/src/uploads/providers/storage-provider.interface.ts`:

```typescript
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface PresignedUploadResult {
  presignedUrl: string;
  publicUrl: string;
}

export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimetype: string): Promise<string>;
  getPresignedUpload(key: string, mimetype: string, expiresInSeconds: number): Promise<PresignedUploadResult>;
}
```

- [ ] **Step 2: Add new exceptions to `apps/api-core/src/uploads/exceptions/uploads.exceptions.ts`**

Append after the existing `ImageUploadFailedException`:

```typescript
import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class ImageUploadFailedException extends BaseException {
  constructor() {
    super(
      'Failed to upload image to storage',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'IMAGE_UPLOAD_FAILED',
    );
  }
}

export class UnsupportedMimetypeException extends BaseException {
  constructor(mimetype: string) {
    super(
      `Unsupported mimetype: ${mimetype}. Allowed: image/jpeg, image/png, image/webp`,
      HttpStatus.BAD_REQUEST,
      'UNSUPPORTED_MIMETYPE',
    );
  }
}

export class InvalidUploadTokenException extends BaseException {
  constructor() {
    super(
      'Upload token is invalid or has expired',
      HttpStatus.UNAUTHORIZED,
      'INVALID_UPLOAD_TOKEN',
    );
  }
}
```

- [ ] **Step 3: Create the presign DTO**

Create `apps/api-core/src/uploads/dto/presign-upload.dto.ts`:

```typescript
import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignUploadDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimetype: 'image/jpeg' | 'image/png' | 'image/webp';
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/uploads/providers/storage-provider.interface.ts \
  apps/api-core/src/uploads/exceptions/uploads.exceptions.ts \
  apps/api-core/src/uploads/dto/presign-upload.dto.ts
git commit -m "feat(uploads): extend StorageProvider interface for presigned uploads"
```

---

## Task 3: R2StorageProvider — implement getPresignedUpload (TDD)

**Files:**
- Modify: `apps/api-core/src/uploads/providers/r2-storage.provider.spec.ts`
- Modify: `apps/api-core/src/uploads/providers/r2-storage.provider.ts`

- [ ] **Step 1: Write the failing tests**

Add at the top of `r2-storage.provider.spec.ts` (before existing mock):

```typescript
const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));
```

Then add a new `describe` block after the existing ones:

```typescript
describe('getPresignedUpload', () => {
  it('should return presignedUrl from getSignedUrl and publicUrl from config', async () => {
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url');

    const result = await provider.getPresignedUpload(
      'restaurants/abc/uuid.jpg',
      'image/jpeg',
      120,
    );

    expect(result.presignedUrl).toBe('https://r2.example.com/signed-url');
    expect(result.publicUrl).toBe('https://pub.example.com/restaurants/abc/uuid.jpg');
  });

  it('should call getSignedUrl with PutObjectCommand using the key and content type', async () => {
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url');
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    await provider.getPresignedUpload('restaurants/abc/uuid.jpg', 'image/jpeg', 120);

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'restaurants/abc/uuid.jpg',
      ContentType: 'image/jpeg',
    });
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 120 },
    );
  });

  it('should throw ImageUploadFailedException when getSignedUrl fails', async () => {
    mockGetSignedUrl.mockRejectedValue(new Error('network error'));

    await expect(
      provider.getPresignedUpload('restaurants/abc/uuid.jpg', 'image/jpeg', 120),
    ).rejects.toThrow(ImageUploadFailedException);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd apps/api-core
pnpm test --testPathPattern="r2-storage.provider.spec"
```

Expected: FAIL — `getPresignedUpload is not a function`

- [ ] **Step 3: Implement `getPresignedUpload` in `r2-storage.provider.ts`**

Add to the `R2Config` interface:

```typescript
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}
```

Replace the full file with:

```typescript
import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider, PresignedUploadResult } from './storage-provider.interface';
import { ImageUploadFailedException } from '../exceptions/uploads.exceptions';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

@Injectable()
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(config: R2Config) {
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: `products/${filename}`,
          Body: buffer,
          ContentType: mimetype,
        }),
      );
      return `${this.publicUrl}/products/${filename}`;
    } catch {
      throw new ImageUploadFailedException();
    }
  }

  async getPresignedUpload(key: string, mimetype: string, expiresInSeconds: number): Promise<PresignedUploadResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: mimetype,
      });
      const presignedUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
      return { presignedUrl, publicUrl: `${this.publicUrl}/${key}` };
    } catch {
      throw new ImageUploadFailedException();
    }
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test --testPathPattern="r2-storage.provider.spec"
```

Expected: all tests PASS (3 existing + 3 new = 6 total)

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/providers/r2-storage.provider.ts \
  apps/api-core/src/uploads/providers/r2-storage.provider.spec.ts
git commit -m "feat(uploads): implement R2StorageProvider.getPresignedUpload"
```

---

## Task 4: LocalStorageProvider — implement getPresignedUpload (TDD)

**Files:**
- Modify: `apps/api-core/src/uploads/providers/local-storage.provider.spec.ts`
- Modify: `apps/api-core/src/uploads/providers/local-storage.provider.ts`

- [ ] **Step 1: Write the failing tests**

Replace the full `local-storage.provider.spec.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { LocalStorageProvider } from './local-storage.provider';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const TEST_UPLOADS_PATH = '/tmp/test-uploads';
const TEST_JWT_SECRET = 'test-secret';
const TEST_API_BASE_URL = 'http://localhost:3000';
const TEST_EXPIRY = 120;

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalStorageProvider(TEST_UPLOADS_PATH, TEST_JWT_SECRET, TEST_API_BASE_URL, TEST_EXPIRY);
  });

  describe('save', () => {
    it('should return a /uploads/products/ URL', async () => {
      const url = await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
      expect(url).toBe('/uploads/products/abc.jpg');
    });

    it('should write the file to the configured uploads/products directory', async () => {
      await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
      const [writePath] = (fs.writeFile as jest.Mock).mock.calls[0];
      expect(writePath).toBe(path.join(TEST_UPLOADS_PATH, 'products', 'abc.jpg'));
    });

    it('should create the directory recursively', async () => {
      await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(TEST_UPLOADS_PATH, 'products'),
        { recursive: true },
      );
    });
  });

  describe('getPresignedUpload', () => {
    it('should return presignedUrl pointing to local-put endpoint with a token', async () => {
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );

      expect(result.presignedUrl).toMatch(
        /^http:\/\/localhost:3000\/v1\/uploads\/local-put\/.+$/,
      );
    });

    it('should return publicUrl as /uploads/{key}', async () => {
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );
      expect(result.publicUrl).toBe('/uploads/restaurants/abc/uuid.jpg');
    });

    it('should embed key and publicUrl in the signed token', async () => {
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );
      const token = result.presignedUrl.split('/').pop()!;
      const payload = jwt.verify(token, TEST_JWT_SECRET) as { key: string; publicUrl: string };

      expect(payload.key).toBe('restaurants/abc/uuid.jpg');
      expect(payload.publicUrl).toBe('/uploads/restaurants/abc/uuid.jpg');
    });

    it('should sign the token with the configured expiry', async () => {
      const before = Math.floor(Date.now() / 1000);
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );
      const after = Math.floor(Date.now() / 1000);
      const token = result.presignedUrl.split('/').pop()!;
      const payload = jwt.verify(token, TEST_JWT_SECRET) as { exp: number };

      expect(payload.exp).toBeGreaterThanOrEqual(before + 120);
      expect(payload.exp).toBeLessThanOrEqual(after + 120);
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
pnpm test --testPathPattern="local-storage.provider.spec"
```

Expected: FAIL — constructor argument mismatch / `getPresignedUpload is not a function`

- [ ] **Step 3: Implement `getPresignedUpload` in `local-storage.provider.ts`**

Replace the full file:

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { StorageProvider, PresignedUploadResult } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly uploadsPath: string,
    private readonly jwtSecret: string,
    private readonly apiBaseUrl: string,
    private readonly presignExpirySeconds: number,
  ) {}

  async save(buffer: Buffer, filename: string, _mimetype: string): Promise<string> {
    const uploadsDir = path.join(this.uploadsPath, 'products');
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, filename), buffer);
    return `/uploads/products/${filename}`;
  }

  async getPresignedUpload(key: string, _mimetype: string, expiresInSeconds: number): Promise<PresignedUploadResult> {
    const publicUrl = `/uploads/${key}`;
    const token = jwt.sign({ key, publicUrl }, this.jwtSecret, { expiresIn: expiresInSeconds });
    const presignedUrl = `${this.apiBaseUrl}/v1/uploads/local-put/${token}`;
    return { presignedUrl, publicUrl };
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test --testPathPattern="local-storage.provider.spec"
```

Expected: all tests PASS (3 existing + 4 new = 7 total)

- [ ] **Step 5: Update `UploadsModule` to pass new constructor args**

In `apps/api-core/src/uploads/uploads.module.ts`, update the factory for `LocalStorageProvider`:

```typescript
return new LocalStorageProvider(
  config.uploadsPath,
  config.jwtSecret,
  config.apiBaseUrl,
  config.presignExpirySeconds,
);
```

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/uploads/providers/local-storage.provider.ts \
  apps/api-core/src/uploads/providers/local-storage.provider.spec.ts \
  apps/api-core/src/uploads/uploads.module.ts
git commit -m "feat(uploads): implement LocalStorageProvider.getPresignedUpload with JWT token"
```

---

## Task 5: UploadsService — add getPresignedUpload (TDD)

**Files:**
- Modify: `apps/api-core/src/uploads/uploads.service.spec.ts`
- Modify: `apps/api-core/src/uploads/uploads.service.ts`

- [ ] **Step 1: Write the failing tests**

Replace the full `uploads.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';
import { uploadsConfig } from './uploads.config';
import { UnsupportedMimetypeException } from './exceptions/uploads.exceptions';

const mockStorageProvider = {
  save: jest.fn(),
  getPresignedUpload: jest.fn(),
};

const mockConfig = {
  uploadStorage: 'local',
  uploadsPath: '/tmp/uploads',
  presignExpirySeconds: 120,
  jwtSecret: 'test-secret',
  apiBaseUrl: 'http://localhost:3000',
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
        { provide: uploadsConfig.KEY, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<UploadsService>(UploadsService);
  });

  describe('saveProductImage', () => {
    it('should return the URL from the storage provider', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/abc.jpg');
      const file = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(1024),
        size: 1024,
      } as Express.Multer.File;

      const url = await service.saveProductImage(file);

      expect(url).toBe('/uploads/products/abc.jpg');
    });

    it('should call provider.save with a UUID filename and correct mimetype', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.jpg');
      const file = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(512),
        size: 512,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(mockStorageProvider.save).toHaveBeenCalledWith(
        file.buffer,
        expect.stringMatching(/^[0-9a-f-]{36}\.jpg$/),
        'image/jpeg',
      );
    });

    it('should use .png extension for image/png', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.png');
      const file = { originalname: 'photo.png', mimetype: 'image/png', buffer: Buffer.alloc(512), size: 512 } as Express.Multer.File;
      await service.saveProductImage(file);
      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.png$/);
    });

    it('should use .webp extension for image/webp', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.webp');
      const file = { originalname: 'photo.webp', mimetype: 'image/webp', buffer: Buffer.alloc(512), size: 512 } as Express.Multer.File;
      await service.saveProductImage(file);
      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.webp$/);
    });
  });

  describe('getPresignedUpload', () => {
    it('should return presignedUrl and publicUrl from provider', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({
        presignedUrl: 'https://example.com/signed',
        publicUrl: '/uploads/restaurants/rest-id/uuid.jpg',
      });

      const result = await service.getPresignedUpload('rest-id', 'image/jpeg');

      expect(result.presignedUrl).toBe('https://example.com/signed');
      expect(result.publicUrl).toBe('/uploads/restaurants/rest-id/uuid.jpg');
    });

    it('should call provider.getPresignedUpload with key restaurants/{restaurantId}/{uuid}.ext', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({
        presignedUrl: 'https://example.com/signed',
        publicUrl: '/uploads/restaurants/rest-id/uuid.jpg',
      });

      await service.getPresignedUpload('rest-id', 'image/jpeg');

      const [key, mimetype, expiry] = mockStorageProvider.getPresignedUpload.mock.calls[0];
      expect(key).toMatch(/^restaurants\/rest-id\/[0-9a-f-]{36}\.jpg$/);
      expect(mimetype).toBe('image/jpeg');
      expect(expiry).toBe(120);
    });

    it('should use .png extension for image/png mimetype', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({ presignedUrl: '', publicUrl: '' });
      await service.getPresignedUpload('rest-id', 'image/png');
      const [key] = mockStorageProvider.getPresignedUpload.mock.calls[0];
      expect(key).toMatch(/\.png$/);
    });

    it('should use .webp extension for image/webp mimetype', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({ presignedUrl: '', publicUrl: '' });
      await service.getPresignedUpload('rest-id', 'image/webp');
      const [key] = mockStorageProvider.getPresignedUpload.mock.calls[0];
      expect(key).toMatch(/\.webp$/);
    });

    it('should throw UnsupportedMimetypeException for unsupported types', async () => {
      await expect(service.getPresignedUpload('rest-id', 'application/pdf'))
        .rejects.toThrow(UnsupportedMimetypeException);
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
pnpm test --testPathPattern="uploads.service.spec"
```

Expected: FAIL — `getPresignedUpload is not a function`

- [ ] **Step 3: Implement `getPresignedUpload` in `uploads.service.ts`**

Replace the full file:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { ConfigType } from '@nestjs/config';
import { STORAGE_PROVIDER, type StorageProvider, type PresignedUploadResult } from './providers/storage-provider.interface';
import { uploadsConfig } from './uploads.config';
import { UnsupportedMimetypeException } from './exceptions/uploads.exceptions';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const ALLOWED_MIMETYPES = Object.keys(MIME_TO_EXT);

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(uploadsConfig.KEY) private readonly config: ConfigType<typeof uploadsConfig>,
  ) {}

  async saveProductImage(file: Express.Multer.File): Promise<string> {
    const ext = MIME_TO_EXT[file.mimetype] ?? '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    return this.storageProvider.save(file.buffer, filename, file.mimetype);
  }

  async getPresignedUpload(restaurantId: string, mimetype: string): Promise<PresignedUploadResult> {
    if (!ALLOWED_MIMETYPES.includes(mimetype)) {
      throw new UnsupportedMimetypeException(mimetype);
    }
    const ext = MIME_TO_EXT[mimetype];
    const key = `restaurants/${restaurantId}/${crypto.randomUUID()}${ext}`;
    return this.storageProvider.getPresignedUpload(key, mimetype, this.config.presignExpirySeconds);
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test --testPathPattern="uploads.service.spec"
```

Expected: all tests PASS (4 existing + 5 new = 9 total)

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/uploads.service.ts \
  apps/api-core/src/uploads/uploads.service.spec.ts
git commit -m "feat(uploads): add UploadsService.getPresignedUpload with restaurant isolation"
```

---

## Task 6: UploadsController — POST /presign endpoint (TDD)

**Files:**
- Modify: `apps/api-core/src/uploads/uploads.controller.spec.ts`
- Modify: `apps/api-core/src/uploads/uploads.controller.ts`

- [ ] **Step 1: Write the failing test**

Replace the full `uploads.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

const mockUploadsService = {
  saveProductImage: jest.fn(),
  getPresignedUpload: jest.fn(),
  saveLocalPut: jest.fn(),
};

const mockUser = { restaurantId: 'rest-123', id: 'user-1', role: 'ADMIN' };

describe('UploadsController', () => {
  let controller: UploadsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        { provide: UploadsService, useValue: mockUploadsService },
        Reflector,
      ],
    }).compile();
    controller = module.get<UploadsController>(UploadsController);
  });

  describe('uploadImage', () => {
    it('should return url from service', async () => {
      mockUploadsService.saveProductImage.mockResolvedValue('/uploads/products/abc.jpg');
      const file = { originalname: 'test.jpg', size: 1024, buffer: Buffer.from('') } as Express.Multer.File;
      const result = await controller.uploadImage(file);
      expect(result).toEqual({ url: '/uploads/products/abc.jpg' });
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(controller.uploadImage(undefined as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('presign', () => {
    it('should return presignedUrl and publicUrl from service', async () => {
      mockUploadsService.getPresignedUpload.mockResolvedValue({
        presignedUrl: 'https://r2.example.com/signed',
        publicUrl: 'https://cdn.example.com/restaurants/rest-123/uuid.jpg',
      });

      const result = await controller.presign(
        mockUser as any,
        { mimetype: 'image/jpeg' },
      );

      expect(result).toEqual({
        presignedUrl: 'https://r2.example.com/signed',
        publicUrl: 'https://cdn.example.com/restaurants/rest-123/uuid.jpg',
      });
      expect(mockUploadsService.getPresignedUpload).toHaveBeenCalledWith('rest-123', 'image/jpeg');
    });
  });

  describe('localPut', () => {
    it('should call saveLocalPut and return 204', async () => {
      mockUploadsService.saveLocalPut.mockResolvedValue(undefined);

      await controller.localPut('some-token', Buffer.from('image data'), 'image/jpeg');

      expect(mockUploadsService.saveLocalPut).toHaveBeenCalledWith(
        'some-token',
        Buffer.from('image data'),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
pnpm test --testPathPattern="uploads.controller.spec"
```

Expected: FAIL — `presign is not a function`, `localPut is not a function`

- [ ] **Step 3: Update `uploads.controller.ts` with new endpoints**

Replace the full file:

```typescript
import {
  Controller,
  Post,
  Put,
  Param,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UploadsService } from './uploads.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1', path: 'uploads' })
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
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

  @Post('presign')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Generate a presigned upload URL for a product image' })
  async presign(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: PresignUploadDto,
  ): Promise<{ presignedUrl: string; publicUrl: string }> {
    return this.uploadsService.getPresignedUpload(user.restaurantId, dto.mimetype);
  }

  @Put('local-put/:token')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept binary image upload in local/Electron mode (token-authenticated)' })
  async localPut(
    @Param('token') token: string,
    @Body() body: Buffer,
    @Headers('content-type') _contentType: string,
  ): Promise<void> {
    await this.uploadsService.saveLocalPut(token, body);
  }
}
```

- [ ] **Step 4: Add `saveLocalPut` stub to `uploads.service.ts` so TypeScript compiles**

This stub exists only so the controller compiles. Task 7 will replace it with the real implementation (TDD).

Add this method to the `UploadsService` class (after `getPresignedUpload`):

```typescript
async saveLocalPut(_token: string, _buffer: Buffer): Promise<void> {
  throw new Error('not implemented');
}
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
pnpm test --testPathPattern="uploads.controller.spec"
```

Expected: all tests PASS (2 existing + 2 new = 4 total)

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/uploads/uploads.controller.ts \
  apps/api-core/src/uploads/uploads.controller.spec.ts \
  apps/api-core/src/uploads/uploads.service.ts \
  apps/api-core/src/uploads/dto/presign-upload.dto.ts
git commit -m "feat(uploads): add presign and local-put controller endpoints"
```

---

## Task 7: UploadsService.saveLocalPut + raw body middleware (TDD)

**Files:**
- Modify: `apps/api-core/src/uploads/uploads.service.spec.ts`
- Modify: `apps/api-core/src/uploads/uploads.service.ts`
- Modify: `apps/api-core/src/uploads/uploads.module.ts`

- [ ] **Step 1: Write the failing test for `saveLocalPut`**

Add this `describe` block to `uploads.service.spec.ts` (inside the top-level `describe('UploadsService', ...)`, after `getPresignedUpload`):

```typescript
describe('saveLocalPut', () => {
  it('should write the buffer to disk at path derived from token', async () => {
    // Create a valid token to simulate what LocalStorageProvider produces
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign(
      { key: 'restaurants/rest-id/uuid.jpg', publicUrl: '/uploads/restaurants/rest-id/uuid.jpg' },
      'test-secret',
      { expiresIn: 120 },
    );

    const fs = await import('fs/promises');
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);

    await service.saveLocalPut(token, Buffer.from('img-bytes'));

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('restaurants/rest-id/uuid.jpg'),
      Buffer.from('img-bytes'),
    );
  });

  it('should throw InvalidUploadTokenException for an expired token', async () => {
    const jwt = await import('jsonwebtoken');
    const expiredToken = jwt.default.sign(
      { key: 'restaurants/rest-id/uuid.jpg', publicUrl: '/uploads/restaurants/rest-id/uuid.jpg' },
      'test-secret',
      { expiresIn: -1 },
    );
    const { InvalidUploadTokenException } = await import('./exceptions/uploads.exceptions');

    await expect(service.saveLocalPut(expiredToken, Buffer.from('img'))).rejects.toThrow(InvalidUploadTokenException);
  });

  it('should throw InvalidUploadTokenException for a tampered token', async () => {
    const { InvalidUploadTokenException } = await import('./exceptions/uploads.exceptions');

    await expect(service.saveLocalPut('not.a.valid.token', Buffer.from('img'))).rejects.toThrow(InvalidUploadTokenException);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm test --testPathPattern="uploads.service.spec"
```

Expected: FAIL — `saveLocalPut is not a function`

- [ ] **Step 3: Implement `saveLocalPut` in `uploads.service.ts`**

Add import at the top of `uploads.service.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { InvalidUploadTokenException } from './exceptions/uploads.exceptions';
```

Add the method to `UploadsService`:

```typescript
async saveLocalPut(token: string, buffer: Buffer): Promise<void> {
  let payload: { key: string; publicUrl: string };
  try {
    payload = jwt.verify(token, this.config.jwtSecret) as { key: string; publicUrl: string };
  } catch {
    throw new InvalidUploadTokenException();
  }

  const filePath = path.join(this.config.uploadsPath, payload.key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test --testPathPattern="uploads.service.spec"
```

Expected: all tests PASS (4 + 5 + 3 = 12 total)

- [ ] **Step 5: Configure raw body middleware in `UploadsModule`**

In `apps/api-core/src/uploads/uploads.module.ts`, add `NestModule` middleware configuration so the `PUT /local-put/:token` route receives a raw `Buffer` body:

```typescript
import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import * as express from 'express';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';
import { uploadsConfig } from './uploads.config';

@Module({
  imports: [ConfigModule.forFeature(uploadsConfig)],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ConfigType<typeof uploadsConfig>) => {
        if (config.uploadStorage === 'r2') {
          const missing = [
            ['CF_R2_ACCOUNT_ID', config.cfR2AccountId],
            ['CF_R2_ACCESS_KEY_ID', config.cfR2AccessKeyId],
            ['CF_R2_SECRET_ACCESS_KEY', config.cfR2SecretAccessKey],
            ['CF_R2_BUCKET_NAME', config.cfR2BucketName],
            ['CF_R2_PUBLIC_URL', config.cfR2PublicUrl],
          ]
            .filter(([, v]) => !v)
            .map(([k]) => k);

          if (missing.length > 0) {
            throw new Error(
              `Missing required R2 environment variables: ${missing.join(', ')}`,
            );
          }

          return new R2StorageProvider({
            accountId: config.cfR2AccountId,
            accessKeyId: config.cfR2AccessKeyId,
            secretAccessKey: config.cfR2SecretAccessKey,
            bucketName: config.cfR2BucketName,
            publicUrl: config.cfR2PublicUrl,
          });
        }
        return new LocalStorageProvider(
          config.uploadsPath,
          config.jwtSecret,
          config.apiBaseUrl,
          config.presignExpirySeconds,
        );
      },
      inject: [uploadsConfig.KEY],
    },
  ],
})
export class UploadsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(express.raw({ type: /^image\//, limit: '10mb' }))
      .forRoutes({ path: 'uploads/local-put/:token', method: RequestMethod.PUT });
  }
}
```

- [ ] **Step 6: Run all uploads unit tests**

```bash
pnpm test --testPathPattern="uploads"
```

Expected: all unit tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/uploads/uploads.service.ts \
  apps/api-core/src/uploads/uploads.service.spec.ts \
  apps/api-core/src/uploads/uploads.module.ts
git commit -m "feat(uploads): implement saveLocalPut with JWT token validation and raw body middleware"
```

---

## Task 8: E2E tests for presign and local-put

**Files:**
- Create: `apps/api-core/test/uploads/presign.e2e-spec.ts`

- [ ] **Step 1: Create the e2e spec**

Create `apps/api-core/test/uploads/presign.e2e-spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './uploads.helpers';

const TEST_DB = path.resolve(__dirname, 'test-presign.db');

const SMALL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
  'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJ' +
  'CQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQAAB//2Q==',
  'base64',
);

describe('Uploads presign flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let basicToken: string;
  let restaurantId: string;

  beforeAll(async () => {
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.UPLOAD_PRESIGN_EXPIRY_SECONDS = '120';

    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const rest = await seedRestaurant(prisma, 'P');
    restaurantId = rest.restaurant.id;
    adminToken = await login(app, rest.admin.email);
    basicToken = await login(app, rest.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  describe('POST /v1/uploads/presign', () => {
    it('sin token recibe 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .send({ mimetype: 'image/jpeg' })
        .expect(401);
    });

    it('BASIC recibe 403', async () => {
      await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${basicToken}`)
        .send({ mimetype: 'image/jpeg' })
        .expect(403);
    });

    it('ADMIN obtiene presignedUrl y publicUrl para image/jpeg', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype: 'image/jpeg' })
        .expect(201);

      expect(res.body.presignedUrl).toMatch(/\/v1\/uploads\/local-put\/.+/);
      expect(res.body.publicUrl).toMatch(/^\/uploads\/restaurants\/.+\.jpg$/);
    });

    it('presignedUrl contiene token con key y publicUrl correctos', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype: 'image/png' })
        .expect(201);

      const token = res.body.presignedUrl.split('/').pop();
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { key: string; publicUrl: string };

      expect(payload.key).toMatch(new RegExp(`^restaurants/${restaurantId}/[0-9a-f-]{36}\\.png$`));
      expect(payload.publicUrl).toMatch(/^\/uploads\/restaurants\/.+\.png$/);
    });

    it('mimetype no soportado recibe 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype: 'application/pdf' })
        .expect(400);
    });
  });

  describe('PUT /v1/uploads/local-put/:token', () => {
    async function getToken(mimetype: string): Promise<{ token: string; publicUrl: string }> {
      const res = await request(app.getHttpServer())
        .post('/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ mimetype })
        .expect(201);

      const token = res.body.presignedUrl.split('/').pop();
      return { token, publicUrl: res.body.publicUrl };
    }

    it('token válido + imagen JPEG → 204 y archivo guardado', async () => {
      const { token, publicUrl } = await getToken('image/jpeg');

      await request(app.getHttpServer())
        .put(`/v1/uploads/local-put/${token}`)
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(204);

      const expectedPath = path.join(process.cwd(), 'uploads', publicUrl.replace('/uploads/', ''));
      expect(fs.existsSync(expectedPath)).toBe(true);
      fs.unlinkSync(expectedPath);
    });

    it('token expirado recibe 401', async () => {
      const expiredToken = jwt.sign(
        { key: `restaurants/${restaurantId}/old.jpg`, publicUrl: '/uploads/restaurants/x/old.jpg' },
        process.env.JWT_SECRET!,
        { expiresIn: -1 },
      );

      await request(app.getHttpServer())
        .put(`/v1/uploads/local-put/${expiredToken}`)
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(401);
    });

    it('token inválido recibe 401', async () => {
      await request(app.getHttpServer())
        .put('/v1/uploads/local-put/not-a-valid-token')
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(401);
    });

    it('no requiere JWT de sesión (es público)', async () => {
      const { token } = await getToken('image/jpeg');

      await request(app.getHttpServer())
        .put(`/v1/uploads/local-put/${token}`)
        .set('Content-Type', 'image/jpeg')
        .send(SMALL_JPEG)
        .expect(204);
    });
  });
});
```

- [ ] **Step 2: Run the e2e tests**

```bash
cd apps/api-core
pnpm test:e2e --testPathPattern="presign.e2e-spec"
```

Expected: all tests PASS

- [ ] **Step 3: Run full e2e suite to verify no regressions**

```bash
pnpm test:e2e
```

Expected: all existing tests continue to PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/test/uploads/presign.e2e-spec.ts
git commit -m "test(uploads): add e2e tests for presign and local-put flow"
```

---

## Task 9: Frontend — update uploadImage()

**Files:**
- Modify: `apps/ui/src/lib/products-api.ts`

- [ ] **Step 1: Replace `uploadImage` in `apps/ui/src/lib/products-api.ts`**

Replace the existing `uploadImage` function (lines 75–82):

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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/ui
pnpm build 2>&1 | tail -20
```

Expected: build succeeds with no type errors related to `uploadImage`.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/lib/products-api.ts
git commit -m "feat(ui): update uploadImage to use presigned URL two-step flow"
```

---

## Task 10: Update module documentation

**Files:**
- Modify: `apps/api-core/src/uploads/uploads.module.info.md`

- [ ] **Step 1: Replace the full content of `uploads.module.info.md`**

```markdown
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

### Providers

| Clase | Condición | presignedUrl retornada | publicUrl retornada |
|-------|-----------|------------------------|---------------------|
| `LocalStorageProvider` | `UPLOAD_STORAGE=local` | `{API_BASE_URL}/v1/uploads/local-put/{jwt}` | `/uploads/restaurants/{restaurantId}/{uuid}.ext` |
| `R2StorageProvider` | `UPLOAD_STORAGE=r2` | URL firmada de Cloudflare R2 | `{UPLOAD_CF_R2_PUBLIC_URL}/restaurants/{restaurantId}/{uuid}.ext` |

### Tests

| Tipo | Archivo | Tests |
|------|---------|-------|
| Unit (service) | `src/uploads/uploads.service.spec.ts` | 12 |
| Unit (controller) | `src/uploads/uploads.controller.spec.ts` | 4 |
| Unit (local provider) | `src/uploads/providers/local-storage.provider.spec.ts` | 7 |
| Unit (R2 provider) | `src/uploads/providers/r2-storage.provider.spec.ts` | 6 |
| E2E (imagen legacy) | `test/uploads/uploadImage.e2e-spec.ts` | 8 |
| E2E (presign flow) | `test/uploads/presign.e2e-spec.ts` | 8 |

### Limitaciones conocidas

- **MIME spoofing:** validación usa `Content-Type` header (puede falsificarse). Verificación de magic bytes pendiente.
- El endpoint `POST /v1/uploads/image` (flujo legacy) no usa aislamiento por `restaurantId` — sigue guardando en `products/{uuid}.ext`.
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/uploads/uploads.module.info.md
git commit -m "docs(uploads): document presigned URL flow, endpoints, config, and CORS setup"
```

---

## Verificación final

- [ ] Correr toda la suite de unit tests de uploads:

```bash
cd apps/api-core && pnpm test --testPathPattern="uploads"
```

- [ ] Correr e2e completo:

```bash
pnpm test:e2e
```

- [ ] Verificar que el frontend compila sin errores:

```bash
cd apps/ui && pnpm build
```
