# Uploads Module Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the uploads module to support dual storage (local disk / Cloudflare R2) via Strategy Pattern, restrict uploads to ADMIN/MANAGER, enforce 2MB limit, and remove compression.

**Architecture:** A `StorageProvider` interface is injected into `UploadsService`. `UploadsModule` registers either `LocalStorageProvider` or `R2StorageProvider` via a factory that reads `UPLOAD_STORAGE` from env. Config vars for R2 are validated at startup if R2 mode is active.

**Tech Stack:** NestJS, `@aws-sdk/client-s3` (S3-compatible R2), multer, supertest (E2E)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `apps/api-core/src/config.ts` | Add `UPLOAD_STORAGE` + 5 R2 env vars |
| Create | `apps/api-core/src/uploads/providers/storage-provider.interface.ts` | `StorageProvider` interface |
| Create | `apps/api-core/src/uploads/providers/local-storage.provider.ts` | Write buffer to disk |
| Create | `apps/api-core/src/uploads/providers/local-storage.provider.spec.ts` | Unit test for local provider |
| Create | `apps/api-core/src/uploads/providers/r2-storage.provider.ts` | Upload buffer to Cloudflare R2 |
| Create | `apps/api-core/src/uploads/providers/r2-storage.provider.spec.ts` | Unit test with mocked S3 client |
| Modify | `apps/api-core/src/uploads/uploads.service.ts` | Remove compression; delegate to provider |
| Modify | `apps/api-core/src/uploads/uploads.service.spec.ts` | Mock provider; remove compression cases |
| Modify | `apps/api-core/src/uploads/uploads.module.ts` | Factory provider; R2 startup validation |
| Modify | `apps/api-core/src/uploads/uploads.controller.ts` | Add `RolesGuard`, `@Roles`, 2MB limit |
| Modify | `apps/api-core/src/uploads/uploads.controller.spec.ts` | Add 403 for BASIC |
| Create | `apps/api-core/test/uploads/uploads.helpers.ts` | `bootstrapApp`, `seedRestaurant`, `login` for uploads E2E |
| Create | `apps/api-core/test/uploads/uploadImage.e2e-spec.ts` | E2E: 8 cases |
| Create | `apps/api-core/src/uploads/uploads.module.info.md` | Module documentation |

---

## Task 1: Add config vars for UPLOAD_STORAGE and Cloudflare R2

**Files:**
- Modify: `apps/api-core/src/config.ts`

- [ ] **Step 1: Add the vars to config.ts**

Open `apps/api-core/src/config.ts`. After the `UPLOADS_PATH` export at the bottom, add:

```ts
// uploads storage
export const UPLOAD_STORAGE = process.env.UPLOAD_STORAGE || 'local'; // 'local' | 'r2'

// Cloudflare R2 — required only when UPLOAD_STORAGE=r2
export const CF_R2_ACCOUNT_ID        = process.env.CF_R2_ACCOUNT_ID        || '';
export const CF_R2_ACCESS_KEY_ID     = process.env.CF_R2_ACCESS_KEY_ID     || '';
export const CF_R2_SECRET_ACCESS_KEY = process.env.CF_R2_SECRET_ACCESS_KEY || '';
export const CF_R2_BUCKET_NAME       = process.env.CF_R2_BUCKET_NAME       || '';
export const CF_R2_PUBLIC_URL        = process.env.CF_R2_PUBLIC_URL        || '';
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd apps/api-core && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/config.ts
git commit -m "feat(uploads): add UPLOAD_STORAGE and CF_R2_* env vars to config"
```

---

## Task 2: Create StorageProvider interface

**Files:**
- Create: `apps/api-core/src/uploads/providers/storage-provider.interface.ts`

- [ ] **Step 1: Create the interface file**

```ts
// apps/api-core/src/uploads/providers/storage-provider.interface.ts
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimetype: string): Promise<string>;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/uploads/providers/storage-provider.interface.ts
git commit -m "feat(uploads): add StorageProvider interface"
```

---

## Task 3: Create LocalStorageProvider with unit test

**Files:**
- Create: `apps/api-core/src/uploads/providers/local-storage.provider.ts`
- Create: `apps/api-core/src/uploads/providers/local-storage.provider.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api-core/src/uploads/providers/local-storage.provider.spec.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalStorageProvider } from './local-storage.provider';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalStorageProvider();
  });

  it('should return a /uploads/products/ URL', async () => {
    const url = await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(url).toBe('/uploads/products/abc.jpg');
  });

  it('should write the file to the uploads/products directory', async () => {
    await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    const [writePath] = (fs.writeFile as jest.Mock).mock.calls[0];
    expect(writePath).toContain(path.join('uploads', 'products', 'abc.jpg'));
  });

  it('should create the directory recursively', async () => {
    await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining(path.join('uploads', 'products')), { recursive: true });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/api-core && npx jest src/uploads/providers/local-storage.provider.spec.ts --no-coverage
```

Expected: FAIL — `LocalStorageProvider` not found.

- [ ] **Step 3: Create LocalStorageProvider**

```ts
// apps/api-core/src/uploads/providers/local-storage.provider.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  async save(buffer: Buffer, filename: string, _mimetype: string): Promise<string> {
    // Read UPLOADS_PATH at call time (not module load time) so E2E tests
    // can override process.env.UPLOADS_PATH in beforeAll before bootstrap.
    const uploadsDir = path.join(
      process.env.UPLOADS_PATH ?? path.join(process.cwd(), 'uploads'),
      'products',
    );
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, filename), buffer);
    return `/uploads/products/${filename}`;
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/api-core && npx jest src/uploads/providers/local-storage.provider.spec.ts --no-coverage
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/providers/local-storage.provider.ts \
        apps/api-core/src/uploads/providers/local-storage.provider.spec.ts
git commit -m "feat(uploads): add LocalStorageProvider"
```

---

## Task 4: Create R2StorageProvider with unit test

**Files:**
- Create: `apps/api-core/src/uploads/providers/r2-storage.provider.ts`
- Create: `apps/api-core/src/uploads/providers/r2-storage.provider.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api-core/src/uploads/providers/r2-storage.provider.spec.ts
import { InternalServerErrorException } from '@nestjs/common';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => input),
}));

// Set required env vars before importing the provider
process.env.CF_R2_ACCOUNT_ID        = 'test-account';
process.env.CF_R2_ACCESS_KEY_ID     = 'test-key';
process.env.CF_R2_SECRET_ACCESS_KEY = 'test-secret';
process.env.CF_R2_BUCKET_NAME       = 'test-bucket';
process.env.CF_R2_PUBLIC_URL        = 'https://pub.example.com';

import { R2StorageProvider } from './r2-storage.provider';

describe('R2StorageProvider', () => {
  let provider: R2StorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new R2StorageProvider();
  });

  it('should return the public CDN URL after upload', async () => {
    mockSend.mockResolvedValue({});
    const url = await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(url).toBe('https://pub.example.com/products/abc.jpg');
  });

  it('should call PutObjectCommand with correct params', async () => {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    mockSend.mockResolvedValue({});
    await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'products/abc.jpg',
      Body: Buffer.from('img'),
      ContentType: 'image/jpeg',
    });
  });

  it('should throw InternalServerErrorException when S3 send fails', async () => {
    mockSend.mockRejectedValue(new Error('S3 error'));
    await expect(provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg'))
      .rejects.toThrow(InternalServerErrorException);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/api-core && npx jest src/uploads/providers/r2-storage.provider.spec.ts --no-coverage
```

Expected: FAIL — `R2StorageProvider` not found.

- [ ] **Step 3: Create R2StorageProvider**

```ts
// apps/api-core/src/uploads/providers/r2-storage.provider.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  CF_R2_ACCOUNT_ID,
  CF_R2_ACCESS_KEY_ID,
  CF_R2_SECRET_ACCESS_KEY,
  CF_R2_BUCKET_NAME,
  CF_R2_PUBLIC_URL,
} from '../../config';
import { StorageProvider } from './storage-provider.interface';

@Injectable()
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: CF_R2_ACCESS_KEY_ID,
        secretAccessKey: CF_R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async save(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: CF_R2_BUCKET_NAME,
          Key: `products/${filename}`,
          Body: buffer,
          ContentType: mimetype,
        }),
      );
      return `${CF_R2_PUBLIC_URL}/products/${filename}`;
    } catch {
      throw new InternalServerErrorException('Error uploading image to storage');
    }
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/api-core && npx jest src/uploads/providers/r2-storage.provider.spec.ts --no-coverage
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/providers/r2-storage.provider.ts \
        apps/api-core/src/uploads/providers/r2-storage.provider.spec.ts
git commit -m "feat(uploads): add R2StorageProvider with Cloudflare R2 support"
```

---

## Task 5: Refactor UploadsService — remove compression, delegate to provider

**Files:**
- Modify: `apps/api-core/src/uploads/uploads.service.ts`
- Modify: `apps/api-core/src/uploads/uploads.service.spec.ts`

- [ ] **Step 1: Update uploads.service.spec.ts**

Replace the entire content of `apps/api-core/src/uploads/uploads.service.spec.ts` with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';

const mockStorageProvider = {
  save: jest.fn(),
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
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

      const file = {
        originalname: 'photo.png',
        mimetype: 'image/png',
        buffer: Buffer.alloc(512),
        size: 512,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.png$/);
    });

    it('should use .webp extension for image/webp', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.webp');

      const file = {
        originalname: 'photo.webp',
        mimetype: 'image/webp',
        buffer: Buffer.alloc(512),
        size: 512,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.webp$/);
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/api-core && npx jest src/uploads/uploads.service.spec.ts --no-coverage
```

Expected: FAIL — `UploadsService` still has the old signature.

- [ ] **Step 3: Replace uploads.service.ts**

Replace the entire content of `apps/api-core/src/uploads/uploads.service.ts` with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { STORAGE_PROVIDER, StorageProvider } from './providers/storage-provider.interface';

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  async saveProductImage(file: Express.Multer.File): Promise<string> {
    const ext = this.getExtension(file.mimetype);
    const filename = `${crypto.randomUUID()}${ext}`;
    return this.storageProvider.save(file.buffer, filename, file.mimetype);
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[mimetype] ?? '.jpg';
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/api-core && npx jest src/uploads/uploads.service.spec.ts --no-coverage
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/uploads/uploads.service.ts \
        apps/api-core/src/uploads/uploads.service.spec.ts
git commit -m "refactor(uploads): delegate storage to provider, remove compression"
```

---

## Task 6: Update UploadsModule — factory provider with R2 validation

**Files:**
- Modify: `apps/api-core/src/uploads/uploads.module.ts`

- [ ] **Step 1: Replace uploads.module.ts**

```ts
// apps/api-core/src/uploads/uploads.module.ts
import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';
import {
  UPLOAD_STORAGE,
  CF_R2_ACCOUNT_ID,
  CF_R2_ACCESS_KEY_ID,
  CF_R2_SECRET_ACCESS_KEY,
  CF_R2_BUCKET_NAME,
  CF_R2_PUBLIC_URL,
} from '../config';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: STORAGE_PROVIDER,
      useFactory: () => {
        if (UPLOAD_STORAGE === 'r2') {
          const missing = [
            ['CF_R2_ACCOUNT_ID', CF_R2_ACCOUNT_ID],
            ['CF_R2_ACCESS_KEY_ID', CF_R2_ACCESS_KEY_ID],
            ['CF_R2_SECRET_ACCESS_KEY', CF_R2_SECRET_ACCESS_KEY],
            ['CF_R2_BUCKET_NAME', CF_R2_BUCKET_NAME],
            ['CF_R2_PUBLIC_URL', CF_R2_PUBLIC_URL],
          ]
            .filter(([, v]) => !v)
            .map(([k]) => k);

          if (missing.length > 0) {
            throw new Error(
              `Missing required R2 environment variables: ${missing.join(', ')}`,
            );
          }
          return new R2StorageProvider();
        }
        return new LocalStorageProvider();
      },
    },
  ],
})
export class UploadsModule {}
```

- [ ] **Step 2: Verify the app still compiles**

```bash
cd apps/api-core && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/uploads/uploads.module.ts
git commit -m "feat(uploads): factory provider with R2 startup validation"
```

---

## Task 7: Update UploadsController — add RolesGuard, @Roles, 2MB limit

**Files:**
- Modify: `apps/api-core/src/uploads/uploads.controller.ts`
- Modify: `apps/api-core/src/uploads/uploads.controller.spec.ts`

- [ ] **Step 1: Update uploads.controller.spec.ts**

Replace the entire content of `apps/api-core/src/uploads/uploads.controller.spec.ts` with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
      expect(mockUploadsService.saveProductImage).toHaveBeenCalledWith(file);
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(controller.uploadImage(undefined as any)).rejects.toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes (no breaking changes yet)**

```bash
cd apps/api-core && npx jest src/uploads/uploads.controller.spec.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 3: Replace uploads.controller.ts**

```ts
// apps/api-core/src/uploads/uploads.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadsService } from './uploads.service';

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
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
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
}
```

- [ ] **Step 4: Run the controller test to confirm it still passes**

```bash
cd apps/api-core && npx jest src/uploads/uploads.controller.spec.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Run all uploads unit tests**

```bash
cd apps/api-core && npx jest src/uploads --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/uploads/uploads.controller.ts \
        apps/api-core/src/uploads/uploads.controller.spec.ts
git commit -m "feat(uploads): restrict to ADMIN/MANAGER, enforce 2MB limit"
```

---

## Task 8: Create E2E helper and E2E tests

**Files:**
- Create: `apps/api-core/test/uploads/uploads.helpers.ts`
- Create: `apps/api-core/test/uploads/uploadImage.e2e-spec.ts`

- [ ] **Step 1: Create uploads.helpers.ts**

```ts
// apps/api-core/test/uploads/uploads.helpers.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function bootstrapApp(dbPath: string): Promise<{
  moduleFixture: TestingModule;
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.UPLOAD_STORAGE = 'local';

  execSync('npx prisma db push', {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();

  const prisma = app.get(PrismaService);
  return { moduleFixture, app, prisma };
}

export async function seedRestaurant(prisma: PrismaService, suffix: string) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Restaurant ${suffix} ${Date.now()}`,
      slug: `rest-${suffix}-${Date.now()}`,
    },
  });

  const passwordHash = await bcrypt.hash('Admin1234!', 10);

  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: `manager-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'MANAGER',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  const basic = await prisma.user.create({
    data: {
      email: `basic-${suffix}-${Date.now()}@test.com`,
      passwordHash,
      role: 'BASIC',
      isActive: true,
      restaurantId: restaurant.id,
    },
  });

  return { restaurant, admin, manager, basic };
}

export async function login(
  app: INestApplication<App>,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect((r) => {
      if (r.status !== 200 && r.status !== 201)
        throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
  return res.body.accessToken as string;
}
```

- [ ] **Step 2: Create uploadImage.e2e-spec.ts**

```ts
// apps/api-core/test/uploads/uploadImage.e2e-spec.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login } from './uploads.helpers';

const TEST_DB = path.resolve(__dirname, 'test-upload-image.db');

// Minimal 1x1 white JPEG (valid image, ~600 bytes)
const SMALL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
  'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJ' +
  'CQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQAAB//2Q==',
  'base64',
);

describe('POST /v1/uploads/image (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let basicToken: string;
  let tmpUploadsDir: string;

  beforeAll(async () => {
    tmpUploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-e2e-'));
    process.env.UPLOADS_PATH = tmpUploadsDir;

    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const rest = await seedRestaurant(prisma, 'U');
    adminToken   = await login(app, rest.admin.email);
    managerToken = await login(app, rest.manager.email);
    basicToken   = await login(app, rest.basic.email);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    fs.rmSync(tmpUploadsDir, { recursive: true, force: true });
  });

  it('Sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .attach('file', SMALL_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('BASIC recibe 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${basicToken}`)
      .attach('file', SMALL_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('ADMIN puede subir JPG y recibe url', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', SMALL_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body.url).toMatch(/^\/uploads\/products\/.+\.jpg$/);
  });

  it('MANAGER puede subir PNG y recibe url', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${managerToken}`)
      .attach('file', SMALL_JPEG, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);

    expect(res.body.url).toMatch(/^\/uploads\/products\/.+\.png$/);
  });

  it('ADMIN puede subir WEBP y recibe url', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', SMALL_JPEG, { filename: 'photo.webp', contentType: 'image/webp' })
      .expect(201);

    expect(res.body.url).toMatch(/^\/uploads\/products\/.+\.webp$/);
  });

  it('Sin archivo recibe 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('Tipo no permitido (PDF) recibe 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'doc.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('Archivo mayor a 2MB recibe 413', async () => {
    const bigBuffer = Buffer.alloc(3 * 1024 * 1024); // 3MB
    await request(app.getHttpServer())
      .post('/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' })
      .expect(413);
  });
});
```

- [ ] **Step 3: Run the E2E tests**

```bash
cd apps/api-core && npx jest test/uploads/uploadImage.e2e-spec.ts --no-coverage --runInBand
```

Expected: PASS — 8 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/test/uploads/uploads.helpers.ts \
        apps/api-core/test/uploads/uploadImage.e2e-spec.ts
git commit -m "test(uploads): add E2E suite for POST /v1/uploads/image"
```

---

## Task 9: Create uploads.module.info.md

**Files:**
- Create: `apps/api-core/src/uploads/uploads.module.info.md`

- [ ] **Step 1: Create the info file**

```markdown
### Upload (uploads)

### Respuesta serializada

**POST /v1/uploads/image** retorna:

```json
{ "url": "string" }
```

En modo `local`: `url` es un path relativo (`/uploads/products/{uuid}.{ext}`), servido como estático.
En modo `r2`: `url` es una URL pública de Cloudflare R2 (`{CF_R2_PUBLIC_URL}/products/{uuid}.{ext}`).

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
| `CF_R2_ACCOUNT_ID` | Account ID de Cloudflare R2 | — (requerido si `r2`) |
| `CF_R2_ACCESS_KEY_ID` | Access Key ID de R2 | — (requerido si `r2`) |
| `CF_R2_SECRET_ACCESS_KEY` | Secret Access Key de R2 | — (requerido si `r2`) |
| `CF_R2_BUCKET_NAME` | Nombre del bucket R2 | — (requerido si `r2`) |
| `CF_R2_PUBLIC_URL` | URL pública del bucket (CDN) | — (requerido si `r2`) |

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
| `R2StorageProvider` | `UPLOAD_STORAGE=r2` | `{CF_R2_PUBLIC_URL}/products/{uuid}.{ext}` |

### Tests existentes

| Tipo | Archivo | Cobertura |
|---|---|---|
| Unit (service) | `src/uploads/uploads.service.spec.ts` | ✅ 4 tests |
| Unit (controller) | `src/uploads/uploads.controller.spec.ts` | ✅ 2 tests |
| Unit (local provider) | `src/uploads/providers/local-storage.provider.spec.ts` | ✅ 3 tests |
| Unit (R2 provider) | `src/uploads/providers/r2-storage.provider.spec.ts` | ✅ 3 tests |
| E2E | `test/uploads/uploadImage.e2e-spec.ts` | ✅ 8 tests |
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/uploads/uploads.module.info.md
git commit -m "docs(uploads): add uploads.module.info.md"
```

---

## Task 10: Run full test suite and verify

- [ ] **Step 1: Run all uploads unit tests**

```bash
cd apps/api-core && npx jest src/uploads --no-coverage
```

Expected: all PASS.

- [ ] **Step 2: Run E2E suite**

```bash
cd apps/api-core && npx jest test/uploads --no-coverage --runInBand
```

Expected: 8 tests PASS.

- [ ] **Step 3: Run full unit test suite to check for regressions**

```bash
cd apps/api-core && npx jest src --no-coverage
```

Expected: all PASS, no regressions.
