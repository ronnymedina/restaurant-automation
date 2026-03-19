# Desktop Distribution — Plan 2: License Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/license-server` — a minimal NestJS API that generates license keys, validates activations with hardware binding, and issues RSA-signed JWTs used by the desktop app for offline verification.

**Architecture:** Standalone NestJS app with a single `LicensesModule`. Uses PostgreSQL on Railway (SQLite locally). RSA-256 asymmetric signing: private key on the server, public key embedded in the Electron binary. The activation endpoint returns a JWT the client can verify offline forever.

**Tech Stack:** NestJS, Prisma, PostgreSQL (Railway) / SQLite (local), `@nestjs/jwt`, RSA key pair (`openssl`), Railway deployment

**Spec:** `docs/superpowers/specs/2026-03-18-desktop-packaging-design.md`

**Prerequisite:** Plan 1 completed (Prisma migrations established, NestJS patterns familiar).

---

## File Map

**Created (`apps/license-server/`):**
- `package.json`
- `tsconfig.json`
- `src/main.ts` — bootstrap, port, global pipes
- `src/app.module.ts` — root module
- `src/config.ts` — env vars (PORT, DATABASE_URL, RSA_PRIVATE_KEY, ADMIN_API_KEY)
- `src/licenses/licenses.module.ts`
- `src/licenses/licenses.service.ts` — generate, activate, deactivate, status
- `src/licenses/licenses.controller.ts` — HTTP endpoints
- `src/licenses/dto/generate-license.dto.ts`
- `src/licenses/dto/activate-license.dto.ts`
- `src/licenses/dto/deactivate-license.dto.ts`
- `prisma/schema.prisma`
- `prisma/migrations/` (auto-generated)
- `.env.example`
- `Dockerfile`

---

## Task 1: Scaffold `apps/license-server`

- [ ] **Step 1.1: Create the app structure**

```bash
mkdir -p apps/license-server/src/licenses/dto
mkdir -p apps/license-server/prisma
```

- [ ] **Step 1.2: Create package.json**

```json
// apps/license-server/package.json
{
  "name": "@restaurants/license-server",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config jest-e2e.config.js",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/swagger": "^8.1.0",
    "@prisma/client": "^6.5.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "dotenv": "^16.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^22.0.0",
    "jest": "^29.0.0",
    "prisma": "^6.5.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 1.3: Create tsconfig.json**

```json
// apps/license-server/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "strict": false,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 1.4: Install dependencies**

```bash
cd apps/license-server && pnpm install
```

- [ ] **Step 1.5: Commit**

```bash
git add apps/license-server/package.json apps/license-server/tsconfig.json
git commit -m "feat(license-server): scaffold NestJS app"
```

---

## Task 2: Generate RSA key pair

The private key lives only on the license server. The public key is embedded in the Electron binary.

- [ ] **Step 2.1: Generate the key pair**

```bash
mkdir -p apps/license-server/keys apps/desktop/resources
openssl genrsa -out apps/license-server/keys/private.pem 2048
openssl rsa -in apps/license-server/keys/private.pem -pubout -out apps/desktop/resources/public.pem
```

- [ ] **Step 2.2: Verify the keys**

```bash
openssl rsa -in apps/license-server/keys/private.pem -check -noout
# Expected: RSA key ok
```

- [ ] **Step 2.3: Add keys to .gitignore**

Add to the root `.gitignore`:
```
apps/license-server/keys/
```

The public key in `apps/desktop/resources/public.pem` IS committed — it's safe to expose.

- [ ] **Step 2.4: Commit the public key**

```bash
git add apps/desktop/resources/public.pem .gitignore
git commit -m "feat(license-server): add RSA public key for desktop license verification"
```

---

## Task 3: Prisma schema and initial migration

**Files:**
- Create: `apps/license-server/prisma/schema.prisma`
- Create: `apps/license-server/prisma/migrations/` (auto-generated)

- [ ] **Step 3.1: Create schema.prisma**

```prisma
// apps/license-server/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model License {
  key         String    @id
  machineId   String?
  platform    String?
  mode        String    @default("desktop")
  activatedAt DateTime?
  status      String    @default("available")
  createdAt   DateTime  @default(now())
}
```

- [ ] **Step 3.2: Create .env for local development**

```bash
# apps/license-server/.env  (do not commit)
DATABASE_URL="file:./dev.db"
RSA_PRIVATE_KEY_PATH="./keys/private.pem"
ADMIN_API_KEY="dev-admin-key-change-in-prod"
PORT=3001
JWT_ISSUER="restaurant-license-server"
```

- [ ] **Step 3.3: Create .env.example**

```bash
# apps/license-server/.env.example
DATABASE_URL="postgresql://user:pass@host:5432/licenses"
RSA_PRIVATE_KEY_PATH="./keys/private.pem"
ADMIN_API_KEY="your-secret-admin-key"
PORT=3001
JWT_ISSUER="restaurant-license-server"
```

- [ ] **Step 3.4: Run initial migration (local SQLite)**

Update schema temporarily for local dev (SQLite provider):
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

```bash
cd apps/license-server && pnpm prisma migrate dev --name init
```

Revert `schema.prisma` back to `provider = "postgresql"` after migration is generated. The migration SQL is provider-agnostic for this schema.

- [ ] **Step 3.5: Commit**

```bash
git add apps/license-server/prisma/ apps/license-server/.env.example
git commit -m "feat(license-server): add Prisma schema and initial migration"
```

---

## Task 4: Config and main bootstrap

**Files:**
- Create: `apps/license-server/src/config.ts`
- Create: `apps/license-server/src/main.ts`

- [ ] **Step 4.1: Create config.ts**

```typescript
// apps/license-server/src/config.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const PORT = Number(process.env.PORT) || 3001;
export const DATABASE_URL = process.env.DATABASE_URL!;
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY!;
export const JWT_ISSUER = process.env.JWT_ISSUER || 'restaurant-license-server';

const keyPath = process.env.RSA_PRIVATE_KEY_PATH
  ? resolve(process.env.RSA_PRIVATE_KEY_PATH)
  : resolve(__dirname, '../keys/private.pem');

export const RSA_PRIVATE_KEY = readFileSync(keyPath, 'utf8');
```

- [ ] **Step 4.2: Create main.ts**

```typescript
// apps/license-server/src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PORT } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('License Server')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(PORT);
  console.log(`License server running on port ${PORT}`);
}
void bootstrap();
```

---

## Task 5: LicensesModule — service and DTOs

**Files:**
- Create: `apps/license-server/src/licenses/dto/generate-license.dto.ts`
- Create: `apps/license-server/src/licenses/dto/activate-license.dto.ts`
- Create: `apps/license-server/src/licenses/dto/deactivate-license.dto.ts`
- Create: `apps/license-server/src/licenses/licenses.service.ts`
- Create: `apps/license-server/src/licenses/licenses.service.spec.ts`

- [ ] **Step 5.1: Create DTOs**

```typescript
// apps/license-server/src/licenses/dto/generate-license.dto.ts
import { IsIn, IsOptional } from 'class-validator';

export class GenerateLicenseDto {
  @IsOptional()
  @IsIn(['desktop', 'cloud'])
  mode?: string;
}
```

```typescript
// apps/license-server/src/licenses/dto/activate-license.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class ActivateLicenseDto {
  @IsString() @IsNotEmpty()
  licenseKey: string;

  @IsString() @IsNotEmpty()
  machineId: string;

  @IsString() @IsNotEmpty()
  platform: string;
}
```

```typescript
// apps/license-server/src/licenses/dto/deactivate-license.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class DeactivateLicenseDto {
  @IsString() @IsNotEmpty()
  licenseKey: string;
}
```

- [ ] **Step 5.2: Write failing tests for LicensesService**

```typescript
// apps/license-server/src/licenses/licenses.service.spec.ts
import { LicensesService } from './licenses.service';

describe('LicensesService', () => {
  let service: LicensesService;

  const mockPrisma = {
    license: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };

  beforeEach(() => {
    service = new LicensesService(mockPrisma as any, mockJwt as any);
  });

  it('generate: creates a license with available status', async () => {
    const key = 'ABCD-1234-EFGH-5678';
    mockPrisma.license.create.mockResolvedValue({ key, status: 'available', mode: 'desktop' });
    const result = await service.generate({ mode: 'desktop' });
    expect(result.key).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(mockPrisma.license.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'available' }) }),
    );
  });

  it('activate: rejects unknown key with 404', async () => {
    mockPrisma.license.findUnique.mockResolvedValue(null);
    await expect(
      service.activate({ licenseKey: 'BAD-KEY', machineId: 'abc', platform: 'win32' }),
    ).rejects.toThrow('License key not found');
  });

  it('activate: rejects revoked license with 410', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ status: 'revoked', machineId: null });
    await expect(
      service.activate({ licenseKey: 'KEY', machineId: 'abc', platform: 'win32' }),
    ).rejects.toThrow('License revoked');
  });

  it('activate: rejects license already bound to different machine with 409', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({
      status: 'active',
      machineId: 'other-machine',
    });
    await expect(
      service.activate({ licenseKey: 'KEY', machineId: 'my-machine', platform: 'win32' }),
    ).rejects.toThrow('License already in use on another machine');
  });

  it('activate: returns JWT token for valid unused license', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ status: 'available', machineId: null, key: 'KEY' });
    mockPrisma.license.update.mockResolvedValue({});
    const result = await service.activate({ licenseKey: 'KEY', machineId: 'my-machine', platform: 'darwin' });
    expect(result.token).toBe('signed-token');
    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ machineId: 'my-machine', licenseKey: 'KEY' }),
      expect.objectContaining({ algorithm: 'RS256' }),
    );
  });

  it('deactivate: resets machineId and sets status to available', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ status: 'active', key: 'KEY' });
    mockPrisma.license.update.mockResolvedValue({});
    await service.deactivate({ licenseKey: 'KEY' });
    expect(mockPrisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ machineId: null, status: 'available' }),
      }),
    );
  });
});
```

- [ ] **Step 5.3: Run tests to confirm they fail**

```bash
cd apps/license-server && pnpm test -- --testPathPattern="licenses.service"
```

Expected: FAIL — `LicensesService` is not defined.

- [ ] **Step 5.4: Create LicensesService**

```typescript
// apps/license-server/src/licenses/licenses.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { GenerateLicenseDto } from './dto/generate-license.dto';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { DeactivateLicenseDto } from './dto/deactivate-license.dto';
import { RSA_PRIVATE_KEY } from '../config';

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
  ) {}

  async generate(dto: GenerateLicenseDto) {
    const key = this.generateKey();
    const license = await this.prisma.license.create({
      data: {
        key,
        mode: dto.mode ?? 'desktop',
        status: 'available',
      },
    });
    return { key: license.key, mode: license.mode, status: license.status };
  }

  async activate(dto: ActivateLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { key: dto.licenseKey },
    });

    if (!license) throw new NotFoundException('License key not found');
    if (license.status === 'revoked') throw new GoneException('License revoked');
    if (license.machineId && license.machineId !== dto.machineId) {
      throw new ConflictException('License already in use on another machine');
    }

    await this.prisma.license.update({
      where: { key: dto.licenseKey },
      data: {
        machineId: dto.machineId,
        platform: dto.platform,
        status: 'active',
        activatedAt: new Date(),
      },
    });

    const token = this.jwt.sign(
      {
        licenseKey: dto.licenseKey,
        machineId: dto.machineId,
        platform: dto.platform,
        activatedAt: new Date().toISOString(),
      },
      {
        algorithm: 'RS256',
        privateKey: RSA_PRIVATE_KEY,
        expiresIn: '100y',
      },
    );

    return { token };
  }

  async deactivate(dto: DeactivateLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { key: dto.licenseKey },
    });
    if (!license) throw new NotFoundException('License key not found');

    await this.prisma.license.update({
      where: { key: dto.licenseKey },
      data: { machineId: null, status: 'available', activatedAt: null },
    });
    return { message: 'Deactivated — machine slot freed' };
  }

  async getStatus(key: string) {
    const license = await this.prisma.license.findUnique({ where: { key } });
    if (!license) throw new NotFoundException('License key not found');
    return {
      key: license.key,
      status: license.status,
      platform: license.platform,
      mode: license.mode,
      activatedAt: license.activatedAt,
    };
  }

  private generateKey(): string {
    const segment = () => randomBytes(2).toString('hex').toUpperCase();
    return `${segment()}-${segment()}-${segment()}-${segment()}`;
  }
}
```

- [ ] **Step 5.5: Run tests to confirm they pass**

```bash
cd apps/license-server && pnpm test -- --testPathPattern="licenses.service"
```

Expected: 5 tests PASS

- [ ] **Step 5.6: Commit**

```bash
git add apps/license-server/src/
git commit -m "feat(license-server): add LicensesService with generate, activate, deactivate, status"
```

---

## Task 6: LicensesController and AppModule

**Files:**
- Create: `apps/license-server/src/licenses/licenses.controller.ts`
- Create: `apps/license-server/src/licenses/licenses.module.ts`
- Create: `apps/license-server/src/app.module.ts`
- Create: `apps/license-server/src/admin.guard.ts`

- [ ] **Step 6.1: Create AdminGuard (protects generate, deactivate, status endpoints)**

```typescript
// apps/license-server/src/admin.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ADMIN_API_KEY } from './config';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_API_KEY) throw new UnauthorizedException();
    return true;
  }
}
```

- [ ] **Step 6.2: Create LicensesController**

```typescript
// apps/license-server/src/licenses/licenses.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { LicensesService } from './licenses.service';
import { GenerateLicenseDto } from './dto/generate-license.dto';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { DeactivateLicenseDto } from './dto/deactivate-license.dto';
import { AdminGuard } from '../admin.guard';

@ApiTags('licenses')
@Controller('licenses')
export class LicensesController {
  constructor(private readonly service: LicensesService) {}

  @Post('generate')
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-key', required: true })
  generate(@Body() dto: GenerateLicenseDto) {
    return this.service.generate(dto);
  }

  @Post('activate')
  activate(@Body() dto: ActivateLicenseDto) {
    return this.service.activate(dto);
  }

  @Post('deactivate')
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-key', required: true })
  deactivate(@Body() dto: DeactivateLicenseDto) {
    return this.service.deactivate(dto);
  }

  @Get(':key/status')
  @UseGuards(AdminGuard)
  @ApiHeader({ name: 'x-admin-key', required: true })
  getStatus(@Param('key') key: string) {
    return this.service.getStatus(key);
  }
}
```

- [ ] **Step 6.3: Create LicensesModule**

`PrismaClient` is provided directly inside `LicensesModule` so NestJS DI can resolve it without cross-module imports:

```typescript
// apps/license-server/src/licenses/licenses.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [LicensesController],
  providers: [
    LicensesService,
    { provide: PrismaClient, useValue: new PrismaClient() },
  ],
})
export class LicensesModule {}
```

- [ ] **Step 6.4: Create AppModule**

```typescript
// apps/license-server/src/app.module.ts
import { Module } from '@nestjs/common';
import { LicensesModule } from './licenses/licenses.module';

@Module({
  imports: [LicensesModule],
})
export class AppModule {}
```

- [ ] **Step 6.5: Run the server locally and smoke-test the endpoints**

```bash
cd apps/license-server && pnpm prisma migrate deploy && pnpm start:dev
```

In another terminal:
```bash
# Generate a key
curl -X POST http://localhost:3001/licenses/generate \
  -H "x-admin-key: dev-admin-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"mode":"desktop"}'
# Expected: {"key":"XXXX-XXXX-XXXX-XXXX","mode":"desktop","status":"available"}

# Activate with that key (replace KEY with the generated one)
curl -X POST http://localhost:3001/licenses/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"XXXX-XXXX-XXXX-XXXX","machineId":"test-machine-id","platform":"darwin"}'
# Expected: {"token":"eyJ..."}
```

- [ ] **Step 6.6: Commit**

```bash
git add apps/license-server/src/
git commit -m "feat(license-server): add LicensesController, AdminGuard, and AppModule"
```

---

## Task 7: Railway deployment

**Files:**
- Create: `apps/license-server/Dockerfile`

- [ ] **Step 7.1: Create Dockerfile**

```dockerfile
# apps/license-server/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
```

- [ ] **Step 7.2: Deploy to Railway**

Use the Railway skill or Railway dashboard to:
1. Create a new Railway project named `license-server`
2. Add a PostgreSQL service
3. Deploy from the `apps/license-server/` directory using the Dockerfile
4. Set environment variables:
   - `DATABASE_URL` — from Railway PostgreSQL service
   - `ADMIN_API_KEY` — a strong random string (save this in your spreadsheet)
   - `RSA_PRIVATE_KEY_PATH` — set to `/app/keys/private.pem` and mount the key as a secret file, OR store the key content directly as `RSA_PRIVATE_KEY` and update `config.ts` to read from env var instead of file

- [ ] **Step 7.3: Update config.ts to support key from env var (for Railway)**

```typescript
// apps/license-server/src/config.ts — update RSA key loading
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY
  ? process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n')  // Railway env vars flatten newlines
  : readFileSync(
      resolve(process.env.RSA_PRIVATE_KEY_PATH ?? './keys/private.pem'),
      'utf8',
    );
```

- [ ] **Step 7.4: Smoke-test the production deployment**

```bash
curl -X POST https://YOUR-RAILWAY-URL/licenses/generate \
  -H "x-admin-key: YOUR-PROD-ADMIN-KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"desktop"}'
```

Expected: a valid license key in JSON response.

- [ ] **Step 7.5: Commit**

```bash
git add apps/license-server/Dockerfile apps/license-server/src/config.ts
git commit -m "feat(license-server): add Dockerfile and Railway-compatible RSA key loading"
```

---

## Verification

1. Unit tests pass: `cd apps/license-server && pnpm test`
2. Generate endpoint requires `x-admin-key` header — returns 401 without it
3. Activate returns RSA-signed JWT verifiable with the public key:
   ```bash
   # Decode the JWT header/payload (without signature verification)
   echo "TOKEN" | cut -d. -f2 | base64 -d
   # Expected: {"licenseKey":"...","machineId":"...","platform":"..."}
   ```
4. Activating same key on a different `machineId` returns 409
5. After deactivate, same key can be activated on a new machineId
