# Per-Restaurant Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-restaurant IANA timezone support so all business logic and date display use the correct local time for each restaurant.

**Architecture:** `timezone` is stored in `RestaurantSettings` (always co-created with `Restaurant`). A `@Global()` `CacheModule` provides a generic `ICacheService` (in-memory for local/desktop, Redis for cloud), used by `TimezoneService` to cache timezone lookups. Backend services receive timezone from the restaurant's settings; the frontend reads it from the login response and formats all dates via `Intl.DateTimeFormat`.

**Tech Stack:** NestJS, Prisma (SQLite/PostgreSQL), `ioredis`, Jest, Astro, `Intl.DateTimeFormat`

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `apps/api-core/src/cache/cache.interface.ts` | `ICacheService` interface + `CACHE_SERVICE` token |
| `apps/api-core/src/cache/in-memory-cache.service.ts` | Map-based cache, for local/desktop mode |
| `apps/api-core/src/cache/redis-cache.service.ts` | ioredis-backed cache, for cloud mode |
| `apps/api-core/src/cache/cache.module.ts` | Global NestJS module, selects implementation via `CACHE_DRIVER` |
| `apps/api-core/src/cache/in-memory-cache.service.spec.ts` | Unit tests for InMemoryCacheService |
| `apps/api-core/src/restaurants/timezone.service.ts` | Resolves timezone from DB with cache |
| `apps/api-core/src/restaurants/timezone.service.spec.ts` | Unit tests for TimezoneService |
| `apps/api-core/src/common/date.utils.ts` | `toUtcBoundary()` — converts local date string to UTC Date |
| `apps/api-core/src/common/date.utils.spec.ts` | Unit tests for toUtcBoundary |
| `apps/ui/src/lib/date.ts` | Frontend `formatDate()` utility using `Intl.DateTimeFormat` |

### Modified files
| Path | Change |
|---|---|
| `apps/api-core/prisma/schema.prisma` | Add `timezone String @default("UTC")` to `RestaurantSettings` |
| `apps/api-core/src/config.ts` | Add `CACHE_DRIVER`, `REDIS_URL`; remove `TIMEZONE` / `requireEnv('TZ')` |
| `apps/api-core/src/app.module.ts` | Import `CacheModule` |
| `apps/api-core/src/restaurants/restaurants.module.ts` | Add `TimezoneService`, import `PrismaModule` |
| `apps/api-core/src/restaurants/restaurant.repository.ts` | Add `createWithSettings()` method |
| `apps/api-core/src/restaurants/restaurants.service.ts` | `createRestaurant(name, timezone?, tx?)` creates settings in tx |
| `apps/api-core/src/restaurants/restaurants.controller.ts` | Add `GET /settings` endpoint |
| `apps/api-core/src/auth/auth.service.ts` | Use `findByIdWithSettings`; include `timezone` in login/refresh response |
| `apps/api-core/src/cli/commands/create-restaurant.command.ts` | Add `--timezone` option |
| `apps/api-core/src/cli/commands/create-dummy.command.ts` | Pass `DUMMY_TIMEZONE` env var to `createRestaurant` |
| `apps/api-core/src/kiosk/kiosk.service.ts` | `resolveRestaurant` → `findBySlugWithSettings`; `getCurrentDayAndTime(now, timezone)` |
| `apps/api-core/src/kiosk/kiosk.service.spec.ts` | Update mocks and `getCurrentDayAndTime` calls to pass timezone |
| `apps/api-core/src/orders/orders.service.ts` | Inject `TimezoneService`; use `toUtcBoundary` in `findHistory` |
| `apps/api-core/src/orders/orders.module.ts` | Import `RestaurantsModule` |
| `apps/api-core/src/print/print.service.ts` | Format dates in restaurant timezone |
| `apps/ui/src/lib/auth.ts` | Add `getRestaurantTimezone`, `setRestaurantTimezone`; clear on logout |
| `apps/ui/src/pages/login.astro` | Store timezone from login response |
| `apps/ui/src/pages/dash/orders-history.astro` | Use `formatDate` with restaurant timezone |
| `apps/ui/src/pages/dash/register-history.astro` | Use `formatDate` with restaurant timezone |
| `apps/ui/src/pages/dash/orders.astro` | Use `formatDate` with restaurant timezone |

---

## Task 1: Prisma schema — add timezone to RestaurantSettings

**Files:**
- Modify: `apps/api-core/prisma/schema.prisma`

- [ ] **Step 1: Add `timezone` field to `RestaurantSettings`**

In `apps/api-core/prisma/schema.prisma`, update the `RestaurantSettings` model:

```prisma
model RestaurantSettings {
  id           String     @id @default(uuid())
  restaurantId String     @unique
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])

  timezone              String    @default("UTC")
  kitchenToken          String?   @unique
  kitchenTokenExpiresAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api-core && pnpm exec prisma migrate dev --name add_timezone_to_restaurant_settings
```

Expected output: `✔ Generated Prisma Client` and a new migration file in `prisma/migrations/`.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/prisma/schema.prisma apps/api-core/prisma/migrations
git commit -m "feat(db): add timezone field to RestaurantSettings"
```

---

## Task 2: CacheModule — interface + InMemoryCacheService + module

**Files:**
- Create: `apps/api-core/src/cache/cache.interface.ts`
- Create: `apps/api-core/src/cache/in-memory-cache.service.ts`
- Create: `apps/api-core/src/cache/in-memory-cache.service.spec.ts`
- Create: `apps/api-core/src/cache/cache.module.ts`

- [ ] **Step 1: Write the failing tests for InMemoryCacheService**

Create `apps/api-core/src/cache/in-memory-cache.service.spec.ts`:

```ts
import { InMemoryCacheService } from './in-memory-cache.service';

describe('InMemoryCacheService', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
  });

  it('returns null for a missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', async () => {
    await cache.set('k', 'hello');
    expect(await cache.get('k')).toBe('hello');
  });

  it('deletes a value', async () => {
    await cache.set('k', 'hello');
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('overwrites an existing value', async () => {
    await cache.set('k', 'first');
    await cache.set('k', 'second');
    expect(await cache.get('k')).toBe('second');
  });

  it('expires a value after ttl elapses', async () => {
    jest.useFakeTimers();
    await cache.set('k', 'v', 1); // 1 second TTL
    jest.advanceTimersByTime(1001);
    expect(await cache.get('k')).toBeNull();
    jest.useRealTimers();
  });

  it('does not expire a value before ttl elapses', async () => {
    jest.useFakeTimers();
    await cache.set('k', 'v', 10);
    jest.advanceTimersByTime(9000);
    expect(await cache.get('k')).toBe('v');
    jest.useRealTimers();
  });

  it('del on non-existent key does not throw', async () => {
    await expect(cache.del('ghost')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=in-memory-cache
```

Expected: FAIL — `Cannot find module './in-memory-cache.service'`

- [ ] **Step 3: Create the cache interface**

Create `apps/api-core/src/cache/cache.interface.ts`:

```ts
export const CACHE_SERVICE = 'CACHE_SERVICE';

export interface ICacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}
```

- [ ] **Step 4: Create InMemoryCacheService**

Create `apps/api-core/src/cache/in-memory-cache.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ICacheService } from './cache.interface';

interface CacheEntry {
  value: string;
  expiresAt?: number;
}

@Injectable()
export class InMemoryCacheService implements ICacheService {
  private readonly store = new Map<string, CacheEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=in-memory-cache
```

Expected: PASS — 7 tests passing.

- [ ] **Step 6: Create CacheModule (no Redis yet — will be added in Task 3)**

Create `apps/api-core/src/cache/cache.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { CACHE_SERVICE } from './cache.interface';
import { InMemoryCacheService } from './in-memory-cache.service';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_SERVICE,
      useClass: InMemoryCacheService,
    },
  ],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
```

> Note: Redis support is wired in Task 3 after adding the config values.

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/cache/
git commit -m "feat(cache): add CacheModule with ICacheService and InMemoryCacheService"
```

---

## Task 3: RedisCacheService

**Files:**
- Create: `apps/api-core/src/cache/redis-cache.service.ts`
- Modify: `apps/api-core/src/cache/cache.module.ts`

- [ ] **Step 1: Install ioredis**

```bash
cd apps/api-core && pnpm add ioredis
```

- [ ] **Step 2: Create RedisCacheService**

Create `apps/api-core/src/cache/redis-cache.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { ICacheService } from './cache.interface';

@Injectable()
export class RedisCacheService implements ICacheService {
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, { lazyConnect: true });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/cache/redis-cache.service.ts
git commit -m "feat(cache): add RedisCacheService"
```

---

## Task 4: config.ts — add CACHE_DRIVER + REDIS_URL, remove TIMEZONE

**Files:**
- Modify: `apps/api-core/src/config.ts`
- Modify: `apps/api-core/src/cache/cache.module.ts`
- Modify: `apps/api-core/.env` (if present — add `CACHE_DRIVER=memory`)

- [ ] **Step 1: Update config.ts**

In `apps/api-core/src/config.ts`:

Remove these lines:
```ts
// timezone — Node reads TZ at startup via dotenv; also used explicitly in Intl.DateTimeFormat
export const TIMEZONE = requireEnv('TZ');
```

Add these lines (place near the bottom, after existing constants):
```ts
// cache
export const CACHE_DRIVER = process.env.CACHE_DRIVER || 'memory'; // 'memory' | 'redis'
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
```

- [ ] **Step 2: Update CacheModule to use config**

Replace the content of `apps/api-core/src/cache/cache.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { CACHE_SERVICE } from './cache.interface';
import { InMemoryCacheService } from './in-memory-cache.service';
import { RedisCacheService } from './redis-cache.service';
import { CACHE_DRIVER, REDIS_URL } from '../config';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_SERVICE,
      useFactory: () => {
        if (CACHE_DRIVER === 'redis') {
          return new RedisCacheService(REDIS_URL);
        }
        return new InMemoryCacheService();
      },
    },
  ],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
```

- [ ] **Step 3: Add CACHE_DRIVER to .env if it exists**

If `apps/api-core/.env` exists, add:
```
CACHE_DRIVER=memory
```

Remove `TZ=...` from `.env` if present (it's no longer required).

- [ ] **Step 4: Run all tests to verify nothing broke**

```bash
cd apps/api-core && pnpm test
```

Expected: all tests still passing (or previously-failing tests still fail for known reasons).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/config.ts apps/api-core/src/cache/cache.module.ts
git commit -m "feat(config): add CACHE_DRIVER/REDIS_URL, remove global TIMEZONE"
```

---

## Task 5: RestaurantRepository + RestaurantsService — always create settings

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurant.repository.ts`
- Modify: `apps/api-core/src/restaurants/restaurants.service.ts`

- [ ] **Step 1: Add `createWithSettings` to RestaurantRepository**

In `apps/api-core/src/restaurants/restaurant.repository.ts`, add this method after the existing `create` method:

```ts
async createWithSettings(
  data: { name: string; slug: string; timezone: string },
  tx?: TransactionClient,
): Promise<Restaurant> {
  const run = async (client: TransactionClient) => {
    const restaurant = await client.restaurant.create({
      data: { name: data.name, slug: data.slug },
    });
    await client.restaurantSettings.create({
      data: { restaurantId: restaurant.id, timezone: data.timezone },
    });
    return restaurant;
  };

  if (tx) return run(tx);
  return this.prisma.$transaction(run);
}
```

- [ ] **Step 2: Update RestaurantsService.createRestaurant signature**

In `apps/api-core/src/restaurants/restaurants.service.ts`, replace the `createRestaurant` method:

```ts
async createRestaurant(name: string, timezone = 'UTC', tx?: TransactionClient): Promise<Restaurant> {
  const slug = await this.generateSlug(name, tx);
  return this.restaurantRepository.createWithSettings({ name, slug, timezone }, tx);
}
```

- [ ] **Step 3: Run tests to catch any callsite breakage**

```bash
cd apps/api-core && pnpm test
```

Existing tests that mock `restaurantRepository.create` will now need to mock `createWithSettings`. If any test fails with "createWithSettings is not a function", update its mock to add `createWithSettings: jest.fn().mockResolvedValue(mockRestaurant)`.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/restaurants/restaurant.repository.ts apps/api-core/src/restaurants/restaurants.service.ts
git commit -m "feat(restaurants): createRestaurant always creates settings with timezone in transaction"
```

---

## Task 6: TimezoneService

**Files:**
- Create: `apps/api-core/src/restaurants/timezone.service.ts`
- Create: `apps/api-core/src/restaurants/timezone.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api-core/src/restaurants/timezone.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { TimezoneService } from './timezone.service';
import { CACHE_SERVICE } from '../cache/cache.interface';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  restaurantSettings: { findUnique: jest.fn() },
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

describe('TimezoneService', () => {
  let service: TimezoneService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TimezoneService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_SERVICE, useValue: mockCache },
      ],
    }).compile();
    service = module.get(TimezoneService);
  });

  describe('getTimezone', () => {
    it('returns cached value without hitting the DB', async () => {
      mockCache.get.mockResolvedValue('America/Mexico_City');

      const tz = await service.getTimezone('rest-1');

      expect(tz).toBe('America/Mexico_City');
      expect(mockPrisma.restaurantSettings.findUnique).not.toHaveBeenCalled();
    });

    it('queries DB on cache miss and stores result in cache', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue({ timezone: 'America/Santiago' });

      const tz = await service.getTimezone('rest-2');

      expect(tz).toBe('America/Santiago');
      expect(mockCache.set).toHaveBeenCalledWith('timezone:rest-2', 'America/Santiago');
    });

    it('throws InternalServerErrorException when settings row is missing', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue(null);

      await expect(service.getTimezone('rest-3')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('invalidate', () => {
    it('deletes the cache entry for the restaurant', async () => {
      await service.invalidate('rest-1');
      expect(mockCache.del).toHaveBeenCalledWith('timezone:rest-1');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=timezone.service
```

Expected: FAIL — `Cannot find module './timezone.service'`

- [ ] **Step 3: Create TimezoneService**

Create `apps/api-core/src/restaurants/timezone.service.ts`:

```ts
import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ICacheService, CACHE_SERVICE } from '../cache/cache.interface';

@Injectable()
export class TimezoneService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async getTimezone(restaurantId: string): Promise<string> {
    const cacheKey = `timezone:${restaurantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      select: { timezone: true },
    });

    if (!settings) {
      throw new InternalServerErrorException(
        `Restaurant ${restaurantId} has no settings — was it created via createRestaurant()?`,
      );
    }

    await this.cache.set(cacheKey, settings.timezone);
    return settings.timezone;
  }

  async invalidate(restaurantId: string): Promise<void> {
    await this.cache.del(`timezone:${restaurantId}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=timezone.service
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/restaurants/timezone.service.ts apps/api-core/src/restaurants/timezone.service.spec.ts
git commit -m "feat(restaurants): add TimezoneService with cache-backed lookup"
```

---

## Task 7: Wire CacheModule + TimezoneService into modules

**Files:**
- Modify: `apps/api-core/src/restaurants/restaurants.module.ts`
- Modify: `apps/api-core/src/app.module.ts`

- [ ] **Step 1: Update RestaurantsModule**

Replace the content of `apps/api-core/src/restaurants/restaurants.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { RestaurantsController } from './restaurants.controller';
import { TimezoneService } from './timezone.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantRepository, TimezoneService],
  exports: [RestaurantsService, RestaurantRepository, TimezoneService],
})
export class RestaurantsModule {}
```

- [ ] **Step 2: Register CacheModule in AppModule**

In `apps/api-core/src/app.module.ts`, add `CacheModule` to the imports array:

```ts
import { CacheModule } from './cache/cache.module';

// In @Module imports array, add:
CacheModule,
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/api-core && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/restaurants/restaurants.module.ts apps/api-core/src/app.module.ts
git commit -m "feat(modules): wire CacheModule globally and TimezoneService into RestaurantsModule"
```

---

## Task 8: CLI — add --timezone to create-restaurant and update create-dummy

**Files:**
- Modify: `apps/api-core/src/cli/commands/create-restaurant.command.ts`
- Modify: `apps/api-core/src/cli/commands/create-dummy.command.ts`

- [ ] **Step 1: Update create-restaurant command**

Replace `apps/api-core/src/cli/commands/create-restaurant.command.ts`:

```ts
import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';

@Command({
  name: 'create-restaurant',
  description: 'Create a restaurant',
})
export class CreateRestaurantCommand extends CommandRunner {
  private readonly logger = new Logger(CreateRestaurantCommand.name);

  constructor(private readonly restaurantsService: RestaurantsService) {
    super();
  }

  async run(
    _passedParams: string[],
    options: { name: string; timezone: string },
  ): Promise<void> {
    if (!options.name) {
      this.logger.error('--name is required');
      return process.exit(1);
    }

    try {
      const restaurant = await this.restaurantsService.createRestaurant(
        options.name,
        options.timezone,
      );
      this.logger.log(
        `Restaurant created successfully:\n  id:       ${restaurant.id}\n  name:     ${restaurant.name}\n  slug:     ${restaurant.slug}\n  timezone: ${options.timezone}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create restaurant: ${error instanceof Error ? error.message : String(error)}`,
      );
      return process.exit(1);
    }
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Restaurant name',
    required: true,
  })
  parseName(val: string): string {
    return val;
  }

  @Option({
    flags: '-tz, --timezone <timezone>',
    description: 'IANA timezone identifier (e.g. America/Mexico_City). Defaults to UTC.',
    required: false,
    defaultValue: 'UTC',
  })
  parseTimezone(val: string): string {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: val });
    } catch {
      throw new Error(`Invalid IANA timezone: "${val}". Example: America/Mexico_City`);
    }
    return val;
  }
}
```

- [ ] **Step 2: Update create-dummy command**

In `apps/api-core/src/cli/commands/create-dummy.command.ts`, add a `DUMMY_TIMEZONE` constant at the top (after the existing constants) and update the `createRestaurant` call:

```ts
// Add near the top with the other constants:
const DUMMY_TIMEZONE = process.env.DUMMY_TIMEZONE || 'UTC';
```

Then find the line that calls `this.restaurantsService.createRestaurant(DUMMY_RESTAURANT_NAME)` and update it to:

```ts
await this.restaurantsService.createRestaurant(DUMMY_RESTAURANT_NAME, DUMMY_TIMEZONE)
```

- [ ] **Step 3: Verify CLI command works**

```bash
cd apps/api-core && pnpm run cli create-restaurant --name "Test TZ" --timezone "America/Mexico_City"
```

Expected output includes `timezone: America/Mexico_City`.

Test invalid timezone:
```bash
cd apps/api-core && pnpm run cli create-restaurant --name "Bad TZ" --timezone "Not/Real"
```

Expected: error message about invalid timezone.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/cli/commands/create-restaurant.command.ts apps/api-core/src/cli/commands/create-dummy.command.ts
git commit -m "feat(cli): add --timezone option to create-restaurant; update create-dummy"
```

---

## Task 9: date.utils.ts — backend timezone date conversion utility

**Files:**
- Create: `apps/api-core/src/common/date.utils.ts`
- Create: `apps/api-core/src/common/date.utils.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api-core/src/common/date.utils.spec.ts`:

```ts
import { toUtcBoundary } from './date.utils';

describe('toUtcBoundary', () => {
  describe('UTC timezone', () => {
    it('start of day returns midnight UTC', () => {
      const result = toUtcBoundary('2026-01-15', 'UTC', 'start');
      expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    });

    it('end of day returns 23:59:59.999 UTC', () => {
      const result = toUtcBoundary('2026-01-15', 'UTC', 'end');
      expect(result.toISOString()).toBe('2026-01-15T23:59:59.999Z');
    });
  });

  describe('America/Argentina/Buenos_Aires (always UTC-3)', () => {
    it('start of day: local midnight = UTC+3h', () => {
      // 2026-01-15 00:00:00 ART = 2026-01-15 03:00:00 UTC
      const result = toUtcBoundary('2026-01-15', 'America/Argentina/Buenos_Aires', 'start');
      expect(result.toISOString()).toBe('2026-01-15T03:00:00.000Z');
    });

    it('end of day: local 23:59:59.999 ART = next UTC day 02:59:59.999', () => {
      // 2026-01-15 23:59:59.999 ART = 2026-01-16 02:59:59.999 UTC
      const result = toUtcBoundary('2026-01-15', 'America/Argentina/Buenos_Aires', 'end');
      expect(result.toISOString()).toBe('2026-01-16T02:59:59.999Z');
    });
  });

  describe('America/Mexico_City (UTC-6 in January)', () => {
    it('start of day: local midnight = UTC+6h', () => {
      // 2026-01-15 00:00:00 CST = 2026-01-15 06:00:00 UTC
      const result = toUtcBoundary('2026-01-15', 'America/Mexico_City', 'start');
      expect(result.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    });

    it('end of day: local 23:59:59.999 CST = next UTC day 05:59:59.999', () => {
      const result = toUtcBoundary('2026-01-15', 'America/Mexico_City', 'end');
      expect(result.toISOString()).toBe('2026-01-16T05:59:59.999Z');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=date.utils
```

Expected: FAIL — `Cannot find module './date.utils'`

- [ ] **Step 3: Implement toUtcBoundary**

Create `apps/api-core/src/common/date.utils.ts`:

```ts
/**
 * Converts a YYYY-MM-DD date string to a UTC Date representing the
 * start or end of that calendar day in the given IANA timezone.
 *
 * Uses iterative Intl refinement to handle DST transitions correctly.
 */
export function toUtcBoundary(
  dateStr: string,
  timezone: string,
  boundary: 'start' | 'end',
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const wantHour = boundary === 'end' ? 23 : 0;
  const wantMin = boundary === 'end' ? 59 : 0;
  const wantSec = boundary === 'end' ? 59 : 0;
  const wantMs = boundary === 'end' ? 999 : 0;

  // Start at noon UTC to avoid same-day edge cases
  let utcMs = Date.UTC(year, month - 1, day, 12, 0, 0);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(utcMs));
    const h = get(parts, 'hour') === 24 ? 0 : get(parts, 'hour');
    const actualMs = Date.UTC(
      get(parts, 'year'),
      get(parts, 'month') - 1,
      get(parts, 'day'),
      h,
      get(parts, 'minute'),
      get(parts, 'second'),
    );
    const wantedMs = Date.UTC(year, month - 1, day, wantHour, wantMin, wantSec);
    utcMs -= actualMs - wantedMs;
  }

  return new Date(utcMs + wantMs);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=date.utils
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/common/date.utils.ts apps/api-core/src/common/date.utils.spec.ts
git commit -m "feat(common): add toUtcBoundary date utility for timezone-aware date filters"
```

---

## Task 10: KioskService — per-restaurant timezone

**Files:**
- Modify: `apps/api-core/src/kiosk/kiosk.service.ts`
- Modify: `apps/api-core/src/kiosk/kiosk.service.spec.ts`

- [ ] **Step 1: Update kiosk.service.spec.ts**

In `apps/api-core/src/kiosk/kiosk.service.spec.ts`, make these changes:

**Change the mock restaurant** to include settings with a timezone (find `const mockRestaurant = ...` and replace):

```ts
const mockRestaurant = {
  id: 'r1',
  slug: 'test-rest',
  name: 'Test',
  settings: { timezone: 'America/Argentina/Buenos_Aires' },
};
```

**Change the mock service** to use `findBySlugWithSettings` instead of `findBySlug` (find `const mockRestaurantsService = ...` and replace):

```ts
const mockRestaurantsService = { findBySlugWithSettings: jest.fn() };
```

**Update `resolveRestaurant` tests** — find the two `resolveRestaurant` tests and update them:

```ts
describe('resolveRestaurant', () => {
  it('throws EntityNotFoundException when slug not found', async () => {
    mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(null);
    await expect(service.resolveRestaurant('unknown')).rejects.toThrow(EntityNotFoundException);
  });

  it('returns restaurant when found', async () => {
    mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(mockRestaurant);
    expect(await service.resolveRestaurant('test-rest')).toEqual(mockRestaurant);
  });
});
```

**Update `getCurrentDayAndTime` tests** — all calls to `service.getCurrentDayAndTime(utc)` need a timezone argument. Add `'America/Argentina/Buenos_Aires'` as the second argument to every call in the `getCurrentDayAndTime` describe block. For example:

```ts
const { currentDay, currentTime } = service.getCurrentDayAndTime(utc, 'America/Argentina/Buenos_Aires');
```

Do this for all four test cases inside the `getCurrentDayAndTime` describe block.

- [ ] **Step 2: Run tests to see which ones fail**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=kiosk.service
```

Expected: tests fail because `kiosk.service.ts` still uses `findBySlug` and old `getCurrentDayAndTime` signature.

- [ ] **Step 3: Update kiosk.service.ts**

Replace the full content of `apps/api-core/src/kiosk/kiosk.service.ts`:

```ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { RestaurantWithSettings } from '../restaurants/restaurant.repository';
import { MenuRepository } from '../menus/menu.repository';
import { OrdersService } from '../orders/orders.service';
import { CashShiftRepository } from '../cash-register/cash-register-session.repository';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { EntityNotFoundException } from '../common/exceptions';
import { RegisterNotOpenException } from '../orders/exceptions/orders.exceptions';
import { STOCK_STATUS, StockStatus } from '../events/kiosk.events';

export interface MenuItemEntry {
  id: string;
  menuItemId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stockStatus: StockStatus;
}

@Injectable()
export class KioskService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly menuRepository: MenuRepository,
    private readonly ordersService: OrdersService,
    private readonly registerSessionRepository: CashShiftRepository,
  ) {}

  async resolveRestaurant(slug: string): Promise<RestaurantWithSettings> {
    const restaurant = await this.restaurantsService.findBySlugWithSettings(slug);
    if (!restaurant) throw new EntityNotFoundException('Restaurant', { slug });
    if (!restaurant.settings) {
      throw new InternalServerErrorException(`Restaurant ${slug} has no settings`);
    }
    return restaurant;
  }

  async getAvailableMenus(slug: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menus = await this.menuRepository.findByRestaurantId(restaurant.id);
    const { currentDay, currentTime } = this.getCurrentDayAndTime(
      new Date(),
      restaurant.settings!.timezone,
    );
    return menus.filter((menu) => this.isMenuAvailable(menu, currentDay, currentTime));
  }

  async getMenuItems(slug: string, menuId: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const menu = await this.menuRepository.findByIdWithItems(menuId, restaurant.id);
    if (!menu) throw new EntityNotFoundException('Menu', menuId);
    const sections = this.buildSections(menu.items);
    return { menuId: menu.id, menuName: menu.name, sections };
  }

  async getStatus(slug: string) {
    const restaurant = await this.resolveRestaurant(slug);
    const session = await this.registerSessionRepository.findOpen(restaurant.id);
    return { registerOpen: !!session };
  }

  async createKioskOrder(slug: string, dto: CreateOrderDto) {
    const restaurant = await this.resolveRestaurant(slug);
    const session = await this.registerSessionRepository.findOpen(restaurant.id);
    if (!session) throw new RegisterNotOpenException();
    return this.ordersService.createOrder(restaurant.id, session.id, dto);
  }

  getCurrentDayAndTime(
    now: Date,
    timezone: string,
  ): { currentDay: string; currentTime: string } {
    const DAY_MAP: Record<string, string> = {
      Mon: 'MON', Tue: 'TUE', Wed: 'WED', Thu: 'THU', Fri: 'FRI', Sat: 'SAT', Sun: 'SUN',
    };

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const normalizedHour = hour === '24' ? '00' : hour;

    return {
      currentDay: DAY_MAP[weekday] ?? weekday.toUpperCase().slice(0, 3),
      currentTime: `${normalizedHour}:${minute}`,
    };
  }

  isMenuAvailable(
    menu: { active: boolean; daysOfWeek?: string | null; startTime?: string | null; endTime?: string | null },
    currentDay: string,
    currentTime: string,
  ): boolean {
    if (!menu.active) return false;
    if (menu.daysOfWeek) {
      const allowedDays = menu.daysOfWeek.split(',').map((d) => d.trim());
      if (!allowedDays.includes(currentDay)) return false;
    }
    if (menu.startTime && currentTime < menu.startTime) return false;
    if (menu.endTime && currentTime > menu.endTime) return false;
    return true;
  }

  private buildSections(items: any[]) {
    const sections = new Map<string, MenuItemEntry[]>();
    for (const item of items) {
      const section = item.sectionName ?? 'General';
      if (!sections.has(section)) sections.set(section, []);
      const stockStatus: StockStatus =
        item.product.stock === null
          ? STOCK_STATUS.AVAILABLE
          : item.product.stock > 0
            ? STOCK_STATUS.AVAILABLE
            : STOCK_STATUS.OUT_OF_STOCK;
      sections.get(section)!.push({
        id: item.product.id,
        menuItemId: item.id,
        name: item.product.name,
        description: item.product.description,
        price: Number(item.product.price),
        imageUrl: item.product.imageUrl,
        stockStatus,
      });
    }
    return Array.from(sections.entries()).map(([name, items]) => ({ name, items }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=kiosk.service
```

Expected: PASS — all kiosk service tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/kiosk/kiosk.service.ts apps/api-core/src/kiosk/kiosk.service.spec.ts
git commit -m "feat(kiosk): use per-restaurant timezone for menu availability"
```

---

## Task 11: OrdersService — timezone-aware date filters

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts`
- Modify: `apps/api-core/src/orders/orders.module.ts`

- [ ] **Step 1: Import RestaurantsModule in OrdersModule**

In `apps/api-core/src/orders/orders.module.ts`, add `RestaurantsModule` to imports:

```ts
import { Module, forwardRef } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderRepository } from './order.repository';
import { EmailModule } from '../email/email.module';
import { PrintModule } from '../print/print.module';
import { EventsModule } from '../events/events.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [EmailModule, forwardRef(() => PrintModule), EventsModule, RestaurantsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
```

- [ ] **Step 2: Update OrdersService to inject TimezoneService and use toUtcBoundary**

In `apps/api-core/src/orders/orders.service.ts`:

Add to the imports at the top of the file:
```ts
import { TimezoneService } from '../restaurants/timezone.service';
import { toUtcBoundary } from '../common/date.utils';
```

Add `TimezoneService` to the constructor:
```ts
constructor(
  private readonly orderRepository: OrderRepository,
  private readonly prisma: PrismaService,
  private readonly orderEventsService: OrderEventsService,
  private readonly emailService: EmailService,
  @Inject(forwardRef(() => PrintService))
  private readonly printService: PrintService,
  private readonly timezoneService: TimezoneService,
) {}
```

Replace the `findHistory` method:
```ts
async findHistory(
  restaurantId: string,
  filters: { orderNumber?: number; status?: OrderStatus; dateFrom?: string; dateTo?: string; page: number; limit: number },
) {
  const timezone = await this.timezoneService.getTimezone(restaurantId);
  const dateFrom = filters.dateFrom
    ? toUtcBoundary(filters.dateFrom, timezone, 'start')
    : undefined;
  const dateTo = filters.dateTo
    ? toUtcBoundary(filters.dateTo, timezone, 'end')
    : undefined;

  return this.orderRepository.findHistory(restaurantId, {
    orderNumber: filters.orderNumber,
    status: filters.status,
    dateFrom,
    dateTo,
    page: filters.page,
    limit: filters.limit,
  });
}
```

- [ ] **Step 3: Update OrdersService tests**

In `apps/api-core/src/orders/orders.service.spec.ts` (if it has tests for `findHistory`), add a mock for `TimezoneService`:

```ts
const mockTimezoneService = { getTimezone: jest.fn().mockResolvedValue('UTC') };
```

And add it to the test module providers:
```ts
{ provide: TimezoneService, useValue: mockTimezoneService },
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=orders
```

Expected: all orders tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/orders.service.ts apps/api-core/src/orders/orders.module.ts
git commit -m "feat(orders): use restaurant timezone for dateFrom/dateTo filters in findHistory"
```

---

## Task 12: PrintService — format dates in restaurant timezone

**Files:**
- Modify: `apps/api-core/src/print/print.service.ts`

- [ ] **Step 1: Update PrintService**

In `apps/api-core/src/print/print.service.ts`, replace `findById` with `findByIdWithSettings` and format the date using the restaurant's timezone.

Add a private helper method to the class:

```ts
private formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
```

In `generateReceipt`, change from `findById` to `findByIdWithSettings`:

```ts
const restaurant = await this.restaurantsService.findByIdWithSettings(order.restaurantId);
if (!restaurant) throw new EntityNotFoundException('Restaurant', order.restaurantId);
const timezone = restaurant.settings?.timezone ?? 'UTC';
```

Then change the `date` field from:
```ts
date: order.createdAt.toISOString(),
```
To:
```ts
date: this.formatDateTime(order.createdAt, timezone),
```

In `generateKitchenTicket`, add a restaurant lookup and format `createdAt`:

```ts
async generateKitchenTicket(orderId: string): Promise<KitchenTicket> {
  const order = await this.orderRepository.findById(orderId);
  if (!order) throw new EntityNotFoundException('Order', orderId);
  const restaurant = await this.restaurantsService.findByIdWithSettings(order.restaurantId);
  const timezone = restaurant?.settings?.timezone ?? 'UTC';
  const orderWithItems = order as typeof order & {
    items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
  };
  return {
    orderNumber: order.orderNumber,
    createdAt: this.formatDateTime(order.createdAt, timezone),
    items: orderWithItems.items.map((item) => ({
      productName: item.product?.name || 'Unknown',
      quantity: item.quantity,
      notes: item.notes || undefined,
    })),
  };
}
```

Apply the same pattern in `generateBoth`: use `findByIdWithSettings` and `formatDateTime` for both `receipt.date` and `kitchenTicket.createdAt`.

- [ ] **Step 2: Run tests**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=print
```

If `print.service.spec.ts` mocks `restaurantsService.findById`, update the mock to include `findByIdWithSettings`:

```ts
const mockRestaurantsService = {
  findById: jest.fn(),
  findByIdWithSettings: jest.fn().mockResolvedValue({
    id: 'r1',
    name: 'Test',
    settings: { timezone: 'UTC' },
  }),
};
```

Expected: all print tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/print/print.service.ts
git commit -m "feat(print): format receipt and ticket timestamps in restaurant timezone"
```

---

## Task 13: AuthService + Settings endpoint — expose timezone to frontend

**Files:**
- Modify: `apps/api-core/src/auth/auth.service.ts`
- Modify: `apps/api-core/src/restaurants/restaurants.controller.ts`

- [ ] **Step 1: Update AuthService.login to include timezone**

In `apps/api-core/src/auth/auth.service.ts`, change the restaurant lookup in `login()` from `findById` to `findByIdWithSettings`:

```ts
const restaurant = await this.restaurantsService.findByIdWithSettings(user.restaurantId);
```

Update the return statement to include `timezone`:

```ts
return {
  accessToken,
  refreshToken,
  timezone: restaurant.settings?.timezone ?? 'UTC',
};
```

Apply the same change to `refreshTokens()` — change `findById` to `findByIdWithSettings` there too and include `timezone` in the return:

```ts
const restaurant = await this.restaurantsService.findByIdWithSettings(user.restaurantId);
// ...
return {
  accessToken,
  refreshToken,
  timezone: restaurant?.settings?.timezone ?? 'UTC',
};
```

- [ ] **Step 2: Add GET /v1/restaurants/settings endpoint**

In `apps/api-core/src/restaurants/restaurants.controller.ts`, add a `GET settings` endpoint:

```ts
import { Controller, Patch, Get, Body, UseGuards } from '@nestjs/common';
// ... existing imports ...

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller({ version: '1', path: 'restaurants' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get restaurant settings including timezone' })
  async getSettings(
    @CurrentUser() user: { restaurantId: string },
  ): Promise<{ timezone: string }> {
    const restaurant = await this.restaurantsService.findByIdWithSettings(user.restaurantId);
    return { timezone: restaurant?.settings?.timezone ?? 'UTC' };
  }

  @Patch('name')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename the restaurant (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'New slug generated', schema: { example: { slug: 'mi-restaurante-nuevo' } } })
  async rename(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: RenameRestaurantDto,
  ): Promise<{ slug: string }> {
    const updated = await this.restaurantsService.rename(user.restaurantId, dto.name);
    return { slug: updated.slug };
  }
}
```

- [ ] **Step 3: Run auth tests**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=auth
```

If `auth.service.spec.ts` mocks `restaurantsService.findById`, add `findByIdWithSettings` to the mock returning `{ settings: { timezone: 'UTC' } }`.

Expected: all auth tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/auth/auth.service.ts apps/api-core/src/restaurants/restaurants.controller.ts
git commit -m "feat(auth): include timezone in login/refresh response; add GET /restaurants/settings"
```

---

## Task 14: Frontend — timezone helpers and formatDate utility

**Files:**
- Modify: `apps/ui/src/lib/auth.ts`
- Create: `apps/ui/src/lib/date.ts`

- [ ] **Step 1: Add timezone helpers to auth.ts**

In `apps/ui/src/lib/auth.ts`, add:

```ts
const TIMEZONE_KEY = 'restaurantTimezone';

export function getRestaurantTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) ?? 'UTC';
}

export function setRestaurantTimezone(timezone: string): void {
  localStorage.setItem(TIMEZONE_KEY, timezone);
}
```

Update `clearTokens` to also clear timezone:

```ts
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TIMEZONE_KEY);
}
```

- [ ] **Step 2: Create date.ts utility**

Create `apps/ui/src/lib/date.ts`:

```ts
/**
 * Formats an ISO date string using the restaurant's IANA timezone.
 * Falls back to 'UTC' if no timezone is stored.
 */
export function formatDate(
  isoString: string | null | undefined,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!isoString) return '—';
  const defaultOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };
  return new Intl.DateTimeFormat('es', {
    timeZone: timezone,
    ...(options ?? defaultOptions),
  }).format(new Date(isoString));
}

export function formatTime(
  isoString: string | null | undefined,
  timezone: string,
): string {
  return formatDate(isoString, timezone, { hour: '2-digit', minute: '2-digit', hour12: false });
}
```

- [ ] **Step 3: Update login.astro to store timezone after successful login**

In `apps/ui/src/pages/login.astro`, find the import of `setTokens`:

```ts
import { setTokens, isAuthenticated } from '../lib/auth';
```

Change it to also import `setRestaurantTimezone`:

```ts
import { setTokens, isAuthenticated, setRestaurantTimezone } from '../lib/auth';
```

Find the line `setTokens(result.accessToken, result.refreshToken)` (around line 157) and add the timezone line after it:

```ts
setTokens(result.accessToken, result.refreshToken);
setRestaurantTimezone(result.timezone ?? 'UTC');
```

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/lib/auth.ts apps/ui/src/lib/date.ts apps/ui/src/pages/login.astro
git commit -m "feat(ui): add timezone localStorage helpers and formatDate utility"
```

---

## Task 15: Frontend — update dashboard pages to use restaurant timezone

**Files:**
- Modify: `apps/ui/src/pages/dash/orders-history.astro`
- Modify: `apps/ui/src/pages/dash/register-history.astro`
- Modify: `apps/ui/src/pages/dash/orders.astro`

### orders-history.astro

- [ ] **Step 1: Update orders-history.astro**

In `apps/ui/src/pages/dash/orders-history.astro`, find the `<script>` section.

Add the import at the top of the script section:

```ts
import { getRestaurantTimezone } from '../../lib/auth';
import { formatDate } from '../../lib/date';
```

Add a `const timezone = getRestaurantTimezone();` line near the top of the script, before the `formatDate` function definition.

Replace the existing `formatDate` function:

```ts
// Remove this:
function formatDate(value: string): string {
  return new Date(value).toLocaleString('es', { ... });
}

// Replace with:
const timezone = getRestaurantTimezone();
```

Then find all usages of the old `formatDate(order.createdAt)` — they remain the same call signature, but now `formatDate` is the imported one. Update any remaining `formatDate(...)` calls to `formatDate(value, timezone)`.

Specifically, find all occurrences of `formatDate(order.createdAt)` and `formatDate(...)` in the template strings and update them:

```ts
// Before:
${formatDate(order.createdAt)}
// After:
${formatDate(order.createdAt, timezone)}
```

### register-history.astro

- [ ] **Step 2: Update register-history.astro**

In `apps/ui/src/pages/dash/register-history.astro`, find the `<script>` section.

Add imports:
```ts
import { getRestaurantTimezone } from '../../lib/auth';
import { formatDate as formatDateTz } from '../../lib/date';
```

Add `const timezone = getRestaurantTimezone();` near the top of the script.

Replace the existing `formatDate` function:
```ts
// Remove:
function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

// Replace with (same name so template usages don't need to change):
function formatDate(value: string | null): string {
  return formatDateTz(value, timezone);
}
```

### orders.astro

- [ ] **Step 3: Update orders.astro**

In `apps/ui/src/pages/dash/orders.astro`, find the `<script>` section.

Add imports:
```ts
import { getRestaurantTimezone } from '../../lib/auth';
import { formatTime } from '../../lib/date';
```

Add `const timezone = getRestaurantTimezone();` near the top of the script.

Find and replace date/time formatting usages:

```ts
// Before:
const time = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
// After:
const time = formatTime(order.createdAt, timezone);
```

```ts
// Before:
${new Date(receipt.date).toLocaleString()}
// After:
${formatDate(receipt.date, timezone)}
```

For the `toLocaleString()` call, also add the `formatDate` import:
```ts
import { getRestaurantTimezone } from '../../lib/auth';
import { formatDate, formatTime } from '../../lib/date';
```

- [ ] **Step 4: Run all backend tests**

```bash
cd apps/api-core && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/pages/dash/orders-history.astro apps/ui/src/pages/dash/register-history.astro apps/ui/src/pages/dash/orders.astro
git commit -m "feat(ui): display all dashboard dates in restaurant timezone"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `timezone` in `RestaurantSettings` | Task 1 |
| Settings always created with restaurant | Task 5 |
| `CacheModule` with `ICacheService` interface | Task 2 |
| `InMemoryCacheService` (desktop) | Task 2 |
| `RedisCacheService` (cloud) | Task 3 |
| `CACHE_DRIVER` config selection | Task 4 |
| `TimezoneService` with cache | Task 6 |
| Module wiring | Task 7 |
| CLI `--timezone` + validation | Task 8 |
| `create-dummy` updated | Task 8 |
| `KioskService` per-restaurant timezone | Task 10 |
| `OrdersService` timezone-aware filters | Task 11 |
| `PrintService` timezone-aware timestamps | Task 12 |
| Login response includes `timezone` | Task 13 |
| `GET /restaurants/settings` endpoint | Task 13 |
| Frontend `formatDate` utility | Task 14 |
| Frontend stores timezone on login | Task 14 |
| Dashboard pages use restaurant timezone | Task 15 |
| Remove global `TIMEZONE` env var | Task 4 |
