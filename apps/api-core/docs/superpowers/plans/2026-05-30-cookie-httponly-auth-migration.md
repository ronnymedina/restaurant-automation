# Cookie httpOnly Auth Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate JWT auth from `Authorization: Bearer` + `localStorage` to httpOnly cookies + `CsrfOriginGuard`, and move SSE tokens out of the URL (dashboard cookie, kitchen `X-Kitchen-Token` header).

**Architecture:** Two httpOnly cookies (`access_token` Path=/ and `refresh_token` Path=/v1/auth) set by the backend on `/v1/auth/login` and `/v1/auth/refresh`. `JwtStrategy` reads only the cookie (Bearer extractor removed). A global `CsrfOriginGuard` validates `Origin` for mutating methods. The frontend drops localStorage tokens, uses `credentials: 'include'`, and replaces the kitchen SSE with `@microsoft/fetch-event-source` to send the kitchen token as a header.

**Tech Stack:** NestJS 10, Express, `cookie-parser`, Passport JWT, Astro + React, `@microsoft/fetch-event-source`.

**Spec:** `apps/api-core/docs/superpowers/specs/2026-05-30-cookie-httponly-auth-migration-design.md`

---

## File Structure

### Backend (new/modified)
- **Modify:** `apps/api-core/src/main.ts` — register `cookieParser`, harden CORS.
- **Modify:** `apps/api-core/src/config.ts` — add `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_ACCESS_MAX_AGE`, `COOKIE_REFRESH_MAX_AGE`, `CORS_ORIGIN`.
- **Modify:** `apps/api-core/src/auth/auth.config.ts` — expose new cookie config to `AuthService`/guard.
- **Create:** `apps/api-core/src/auth/cookies/auth-cookies.ts` — single source of truth for cookie names, paths and serializer options.
- **Modify:** `apps/api-core/src/auth/strategies/jwt.strategy.ts` — read JWT from `req.cookies.access_token` only.
- **Modify:** `apps/api-core/src/auth/auth.controller.ts` — `login`, `refresh`, `logout` set/clear cookies; `login` and `refresh` return body without tokens.
- **Modify:** `apps/api-core/src/auth/auth.service.ts` — same return shape (drop `accessToken`, `refreshToken` from result, keep `timezone`) but produce both tokens for the controller to set in cookies.
- **Delete:** `apps/api-core/src/auth/dto/refresh-token.dto.ts` — no longer needed.
- **Modify:** `apps/api-core/src/auth/dto/auth-tokens-response.dto.ts` → rename to `AuthLoginResponseDto` containing only `{ timezone }`.
- **Modify:** `apps/api-core/src/auth/dto/index.ts` — drop the refresh DTO export, rename auth-tokens export.
- **Create:** `apps/api-core/src/auth/guards/csrf-origin.guard.ts` — global guard.
- **Modify:** `apps/api-core/src/app.module.ts` — register `CsrfOriginGuard` as `APP_GUARD`.
- **Modify:** `apps/api-core/src/events/events.controller.ts` — `dashboard` uses `JwtAuthGuard` + `@CurrentUser`; `kitchen` reads `X-Kitchen-Token` header.
- **Modify:** `apps/api-core/src/kitchen/guards/kitchen-token.guard.ts` — drop query fallback, header-only.
- **Modify:** test helpers and ~30 e2e files to send cookies instead of Bearer.
- **Create:** `apps/api-core/test/helpers/auth-cookie.ts` — shared `loginAndGetCookie()` helper.
- **Create:** `apps/api-core/test/csrf.e2e-spec.ts` — Origin matrix.
- **Modify:** `apps/api-core/package.json` — add `cookie-parser`, `@types/cookie-parser`.

### Frontend (new/modified)
- **Modify:** `apps/ui/package.json` — add `@microsoft/fetch-event-source`.
- **Modify:** `apps/ui/src/lib/auth.ts` — keep only timezone helpers + async `isAuthenticated()`.
- **Modify:** `apps/ui/src/lib/api.ts` — `credentials: 'include'`, drop Bearer header, refresh body empty.
- **Modify:** `apps/ui/src/pages/login.astro` — drop `setTokens`; async `isAuthenticated` check.
- **Modify:** `apps/ui/src/layouts/DashboardLayout.astro` — logout calls `POST /v1/auth/logout` then clears local timezone.
- **Modify:** `apps/ui/src/layouts/ProtectedLayout.astro` — await `isAuthenticated()`.
- **Modify:** `apps/ui/src/components/dash/orders/OrdersPanel.tsx` — `EventSource(..., { withCredentials: true })`, no token in URL.
- **Modify:** `apps/ui/src/pages/kitchen/index.astro` — `fetchEventSource` with `X-Kitchen-Token` header; `kitchenFetch` uses header.
- **Modify:** `apps/ui/src/components/kitchen/KitchenConfirmModal.tsx` — header instead of `?token=`.
- **Modify:** `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx` — mock `EventSource` w/o token.

### Documentation
- **Create:** `apps/api-core/docs/adr/README.md`.
- **Create:** `apps/api-core/docs/adr/0001-cookie-httponly-auth.md`.
- **Modify:** `apps/api-core/docs/environments.md` — new env vars.
- **Modify:** `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` — H-04 ✅.
- **Modify:** `apps/api-core/src/auth/auth.module.info.md` — new flow (if file exists).
- **Modify:** `apps/ui/README.md` — auth flow note.

---

## Conventions

- All tests run **inside Docker** per project rule: `docker compose exec res-api-core pnpm test:e2e -- <pattern>`.
- Backend commits prefix: `feat(auth):`, `fix(auth):`, `test(auth):`, `refactor(auth):`.
- Frontend commits prefix: `feat(ui):`, `refactor(ui):`.
- Commit each task atomically. Do not bundle.

---

## Task 1: Add cookie-parser dependency and base config

**Files:**
- Modify: `apps/api-core/package.json`
- Modify: `apps/api-core/src/config.ts`
- Modify: `apps/api-core/src/main.ts`

- [ ] **Step 1: Install `cookie-parser`**

Run from repo root:
```bash
docker compose exec res-api-core pnpm add cookie-parser
docker compose exec res-api-core pnpm add -D @types/cookie-parser
```

Expected: `apps/api-core/package.json` lists `"cookie-parser": "^1.x"` under deps and `"@types/cookie-parser"` under devDeps. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Add new env vars to `src/config.ts`**

Add to the `EnvironmentVariables` class (alphabetically near other JWT/cors vars):

```ts
  // --- cookies / cors ---

  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  @IsOptional()
  @IsString()
  COOKIE_SECURE?: string;

  @IsOptional()
  @IsNumber()
  @Min(60_000)
  COOKIE_ACCESS_MAX_AGE?: number;

  @IsOptional()
  @IsNumber()
  @Min(60_000)
  COOKIE_REFRESH_MAX_AGE?: number;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;
```

And at the bottom of `config.ts`, after `FRONTEND_URL`:

```ts
// cookies
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? '';
export const COOKIE_SECURE = (process.env.COOKIE_SECURE ?? 'true').toLowerCase() === 'true';
export const COOKIE_ACCESS_MAX_AGE = Number(process.env.COOKIE_ACCESS_MAX_AGE) || 15 * 60 * 1000;
export const COOKIE_REFRESH_MAX_AGE = Number(process.env.COOKIE_REFRESH_MAX_AGE) || 7 * 24 * 60 * 60 * 1000;

// cors — comma-separated allowlist of origins authorised to send credentialed requests
export const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? FRONTEND_URL)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
```

- [ ] **Step 3: Wire `cookieParser` and tighten CORS in `src/main.ts`**

Replace the CORS block:

```ts
import cookieParser from 'cookie-parser';
// ...
import { NODE_ENV, PORT, FRONTEND_URL, UPLOADS_PATH, CORS_ORIGIN } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use('/uploads', express.static(UPLOADS_PATH));

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: CORS_ORIGIN.length > 0 ? CORS_ORIGIN : FRONTEND_URL,
    credentials: true,
  });
  // rest unchanged
}
```

Keep `FRONTEND_URL` import only if used elsewhere; if not, remove it.

- [ ] **Step 4: Type-check passes**

Run:
```bash
docker compose exec res-api-core pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/package.json pnpm-lock.yaml apps/api-core/src/config.ts apps/api-core/src/main.ts
git commit -m "feat(auth): add cookie-parser middleware and cookie/cors env vars (H-04)"
```

---

## Task 2: Cookie options module

**Files:**
- Create: `apps/api-core/src/auth/cookies/auth-cookies.ts`
- Create: `apps/api-core/src/auth/cookies/auth-cookies.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api-core/src/auth/cookies/auth-cookies.spec.ts`:

```ts
import { buildAccessCookieOptions, buildRefreshCookieOptions, buildClearOptions, COOKIE_NAMES } from './auth-cookies';

describe('auth-cookies', () => {
  const base = { domain: '.daikulab.com', secure: true, accessMaxAge: 900_000, refreshMaxAge: 604_800_000 };

  it('exposes stable cookie names', () => {
    expect(COOKIE_NAMES.access).toBe('access_token');
    expect(COOKIE_NAMES.refresh).toBe('refresh_token');
  });

  it('access cookie options are httpOnly, Lax, Secure, Path=/ and scoped to domain', () => {
    const opts = buildAccessCookieOptions(base);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 900_000,
      domain: '.daikulab.com',
    });
  });

  it('refresh cookie options are Path=/v1/auth and use refresh max-age', () => {
    const opts = buildRefreshCookieOptions(base);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/v1/auth',
      maxAge: 604_800_000,
    });
  });

  it('omits the domain attribute when domain is empty (dev)', () => {
    const opts = buildAccessCookieOptions({ ...base, domain: '' });
    expect(opts).not.toHaveProperty('domain');
  });

  it('buildClearOptions returns matching path + domain, no maxAge', () => {
    const clearAccess = buildClearOptions({ ...base, name: 'access' });
    expect(clearAccess).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      domain: '.daikulab.com',
    });
    const clearRefresh = buildClearOptions({ ...base, name: 'refresh' });
    expect(clearRefresh.path).toBe('/v1/auth');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
docker compose exec res-api-core pnpm test -- auth-cookies.spec
```

Expected: FAIL — `Cannot find module './auth-cookies'`.

- [ ] **Step 3: Implement the module**

Create `apps/api-core/src/auth/cookies/auth-cookies.ts`:

```ts
import type { CookieOptions } from 'express';

export const COOKIE_NAMES = {
  access: 'access_token',
  refresh: 'refresh_token',
} as const;

export const COOKIE_PATHS = {
  access: '/',
  refresh: '/v1/auth',
} as const;

interface BaseInput {
  domain: string;
  secure: boolean;
}

interface AccessInput extends BaseInput {
  accessMaxAge: number;
}

interface RefreshInput extends BaseInput {
  refreshMaxAge: number;
}

interface ClearInput extends BaseInput {
  name: keyof typeof COOKIE_NAMES;
}

function withOptionalDomain<T extends CookieOptions>(opts: T, domain: string): T {
  if (!domain) return opts;
  return { ...opts, domain };
}

export function buildAccessCookieOptions(input: AccessInput): CookieOptions {
  return withOptionalDomain(
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: input.secure,
      path: COOKIE_PATHS.access,
      maxAge: input.accessMaxAge,
    },
    input.domain,
  );
}

export function buildRefreshCookieOptions(input: RefreshInput): CookieOptions {
  return withOptionalDomain(
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: input.secure,
      path: COOKIE_PATHS.refresh,
      maxAge: input.refreshMaxAge,
    },
    input.domain,
  );
}

export function buildClearOptions(input: ClearInput): CookieOptions {
  return withOptionalDomain(
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: input.secure,
      path: COOKIE_PATHS[input.name],
    },
    input.domain,
  );
}
```

- [ ] **Step 4: Run the test, verify pass**

```bash
docker compose exec res-api-core pnpm test -- auth-cookies.spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/auth/cookies/
git commit -m "feat(auth): add auth cookie options builder (H-04)"
```

---

## Task 3: Switch JwtStrategy to cookie extractor

**Files:**
- Modify: `apps/api-core/src/auth/strategies/jwt.strategy.ts`
- Modify: `apps/api-core/src/auth/auth.config.ts`
- Create/Modify: `apps/api-core/src/auth/strategies/jwt.strategy.spec.ts`

- [ ] **Step 1: Expand `auth.config.ts` with cookie fields**

```ts
import { registerAs } from '@nestjs/config';
import {
  JWT_SECRET,
  JWT_ACCESS_EXPIRATION,
  JWT_REFRESH_EXPIRATION,
  COOKIE_DOMAIN,
  COOKIE_SECURE,
  COOKIE_ACCESS_MAX_AGE,
  COOKIE_REFRESH_MAX_AGE,
} from '../config';

export const authConfig = registerAs('auth', () => ({
  jwtSecret: JWT_SECRET,
  jwtAccessExpiration: JWT_ACCESS_EXPIRATION,
  jwtRefreshExpiration: JWT_REFRESH_EXPIRATION,
  cookieDomain: COOKIE_DOMAIN,
  cookieSecure: COOKIE_SECURE,
  cookieAccessMaxAge: COOKIE_ACCESS_MAX_AGE,
  cookieRefreshMaxAge: COOKIE_REFRESH_MAX_AGE,
}));
```

- [ ] **Step 2: Write the failing strategy test**

Create `apps/api-core/src/auth/strategies/jwt.strategy.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { authConfig } from '../auth.config';
import type { Request } from 'express';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '7d';
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: authConfig.KEY, useValue: authConfig() },
      ],
    }).compile();
    strategy = moduleRef.get(JwtStrategy);
  });

  function extract(req: Partial<Request>): string | null {
    // @ts-expect-error access private opts for test
    const fn = (strategy as any)._jwtFromRequest as (r: Request) => string | null;
    return fn(req as Request);
  }

  it('reads token from req.cookies.access_token', () => {
    expect(extract({ cookies: { access_token: 'jwt-here' } })).toBe('jwt-here');
  });

  it('returns null when cookie is missing', () => {
    expect(extract({ cookies: {} })).toBeNull();
    expect(extract({})).toBeNull();
  });

  it('ignores Authorization Bearer headers', () => {
    expect(extract({ headers: { authorization: 'Bearer jwt-from-header' }, cookies: {} })).toBeNull();
  });

  it('validate maps payload to user shape', () => {
    expect(strategy.validate({ sub: 'u1', email: 'e@x', role: 'ADMIN', restaurantId: 'r1' })).toEqual({
      id: 'u1',
      email: 'e@x',
      role: 'ADMIN',
      restaurantId: 'r1',
    });
  });
});
```

- [ ] **Step 3: Run, verify it fails (Bearer header path still wins)**

```bash
docker compose exec res-api-core pnpm test -- jwt.strategy.spec
```

Expected: FAIL — "ignores Authorization Bearer headers" fails because current extractor is `fromAuthHeaderAsBearerToken`.

- [ ] **Step 4: Update `jwt.strategy.ts`**

```ts
import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';

import { authConfig } from '../auth.config';
import { COOKIE_NAMES } from '../cookies/auth-cookies';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  restaurantId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(authConfig.KEY)
    private readonly configService: ConfigType<typeof authConfig>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req?.cookies?.[COOKIE_NAMES.access] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.jwtSecret,
    });
  }

  validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      restaurantId: payload.restaurantId,
    };
  }
}
```

- [ ] **Step 5: Run the test, verify pass**

```bash
docker compose exec res-api-core pnpm test -- jwt.strategy.spec
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/auth/strategies/jwt.strategy.ts apps/api-core/src/auth/strategies/jwt.strategy.spec.ts apps/api-core/src/auth/auth.config.ts
git commit -m "feat(auth): JwtStrategy reads cookie only, rejects Bearer (H-04)"
```

> **NOTE:** All e2e tests will now fail until Task 11 updates them. Continue through Tasks 4-10 first.

---

## Task 4: AuthController.login sets cookies, body without tokens

**Files:**
- Modify: `apps/api-core/src/auth/auth.service.ts`
- Modify: `apps/api-core/src/auth/auth.controller.ts`
- Create: `apps/api-core/src/auth/dto/auth-login-response.dto.ts`
- Modify: `apps/api-core/src/auth/dto/index.ts`
- Delete: `apps/api-core/src/auth/dto/auth-tokens-response.dto.ts`
- Modify: `apps/api-core/src/auth/auth.controller.spec.ts`
- Modify: `apps/api-core/src/auth/auth.service.spec.ts` (if exists)

- [ ] **Step 1: Create new response DTO**

Create `apps/api-core/src/auth/dto/auth-login-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class AuthLoginResponseDto {
  @ApiProperty({ example: 'America/Lima', description: 'Restaurant timezone, used by the frontend to format dates' })
  timezone: string;
}
```

- [ ] **Step 2: Update `dto/index.ts`**

```ts
export { LoginDto } from './login.dto';
export { AuthLoginResponseDto } from './auth-login-response.dto';
export { ProfileResponseDto, RestaurantProfileDto } from './profile-response.dto';
export { LogoutResponseDto } from './logout-response.dto';
export { RecoverDto } from './recover.dto';
export { ResetPasswordDto } from './reset-password.dto';
export { ResetPasswordResponseDto } from './reset-password-response.dto';
```

Remove `RefreshTokenDto` and `AuthTokensResponseDto` exports. Delete the file `auth-tokens-response.dto.ts` (and `refresh-token.dto.ts` in Task 5).

- [ ] **Step 3: Write failing controller test**

In `apps/api-core/src/auth/auth.controller.spec.ts` (create if missing, otherwise replace `login` block). Use Nest test fixture with mocked `AuthService`:

```ts
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { authConfig } from './auth.config';
import { Response } from 'express';

describe('AuthController.login', () => {
  let controller: AuthController;
  let service: AuthService;
  const cookieMock = jest.fn();
  const res = { cookie: cookieMock } as unknown as Response;

  beforeEach(async () => {
    cookieMock.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login: jest.fn() } },
        { provide: authConfig.KEY, useValue: { cookieDomain: '', cookieSecure: false, cookieAccessMaxAge: 900_000, cookieRefreshMaxAge: 604_800_000 } },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
    service = moduleRef.get(AuthService);
  });

  it('sets access_token and refresh_token cookies and returns only timezone', async () => {
    (service.login as jest.Mock).mockResolvedValue({
      accessToken: 'jwt-here',
      refreshToken: 'refresh-uuid',
      timezone: 'UTC',
    });

    const result = await controller.login({ email: 'e@x', password: 'pw' }, res);

    expect(result).toEqual({ timezone: 'UTC' });
    expect(cookieMock).toHaveBeenCalledTimes(2);
    expect(cookieMock).toHaveBeenCalledWith('access_token', 'jwt-here', expect.objectContaining({
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 900_000,
    }));
    expect(cookieMock).toHaveBeenCalledWith('refresh_token', 'refresh-uuid', expect.objectContaining({
      httpOnly: true, sameSite: 'lax', path: '/v1/auth', maxAge: 604_800_000,
    }));
  });
});
```

- [ ] **Step 4: Run, verify fail**

```bash
docker compose exec res-api-core pnpm test -- auth.controller.spec
```

Expected: FAIL (controller still returns body tokens, doesn't accept `res`).

- [ ] **Step 5: Update `auth.controller.ts` login + imports**

```ts
import {
  Controller, Post, Put, Get, Body, UseGuards, HttpCode, Res, Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ConfigType } from '@nestjs/config';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { authConfig } from './auth.config';
import {
  LoginDto,
  AuthLoginResponseDto,
  ProfileResponseDto,
  LogoutResponseDto,
  RecoverDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailThrottlerGuard } from './guards/email-throttler.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  COOKIE_NAMES,
  buildAccessCookieOptions,
  buildRefreshCookieOptions,
} from './cookies/auth-cookies';

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(authConfig.KEY)
    private readonly cfg: ConfigType<typeof authConfig>,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Authenticate a user and set auth cookies' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful — cookies set', type: AuthLoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials or inactive account' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthLoginResponseDto> {
    const { accessToken, refreshToken, timezone } =
      await this.authService.login(dto.email, dto.password);

    res.cookie(
      COOKIE_NAMES.access,
      accessToken,
      buildAccessCookieOptions({
        domain: this.cfg.cookieDomain,
        secure: this.cfg.cookieSecure,
        accessMaxAge: this.cfg.cookieAccessMaxAge,
      }),
    );
    res.cookie(
      COOKIE_NAMES.refresh,
      refreshToken,
      buildRefreshCookieOptions({
        domain: this.cfg.cookieDomain,
        secure: this.cfg.cookieSecure,
        refreshMaxAge: this.cfg.cookieRefreshMaxAge,
      }),
    );

    return { timezone };
  }

  // ... refresh, logout updated in tasks 5 + 6
  // me, recover, reset-password unchanged
}
```

Keep `me`, `recover`, `resetPassword` as in the current file (only the imports referenced above change).

- [ ] **Step 6: Run, verify pass**

```bash
docker compose exec res-api-core pnpm test -- auth.controller.spec
```

Expected: PASS for login block.

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/auth/auth.controller.ts apps/api-core/src/auth/dto/auth-login-response.dto.ts apps/api-core/src/auth/dto/index.ts apps/api-core/src/auth/dto/auth-tokens-response.dto.ts apps/api-core/src/auth/auth.controller.spec.ts
git rm apps/api-core/src/auth/dto/auth-tokens-response.dto.ts
git commit -m "feat(auth): login sets httpOnly cookies, body returns only timezone (H-04)"
```

---

## Task 5: AuthController.refresh reads cookie

**Files:**
- Modify: `apps/api-core/src/auth/auth.controller.ts`
- Modify: `apps/api-core/src/auth/auth.controller.spec.ts`
- Delete: `apps/api-core/src/auth/dto/refresh-token.dto.ts`

- [ ] **Step 1: Write failing test**

Add to `auth.controller.spec.ts`:

```ts
describe('AuthController.refresh', () => {
  let controller: AuthController;
  let service: AuthService;
  const cookieMock = jest.fn();
  const res = { cookie: cookieMock } as unknown as Response;

  beforeEach(async () => {
    cookieMock.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { refreshTokens: jest.fn() } },
        { provide: authConfig.KEY, useValue: { cookieDomain: '', cookieSecure: false, cookieAccessMaxAge: 900_000, cookieRefreshMaxAge: 604_800_000 } },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
    service = moduleRef.get(AuthService);
  });

  it('rotates tokens using the refresh cookie and re-sets both cookies', async () => {
    (service.refreshTokens as jest.Mock).mockResolvedValue({
      accessToken: 'new-jwt', refreshToken: 'new-uuid', timezone: 'UTC',
    });
    const req = { cookies: { refresh_token: 'old-uuid' } } as any;

    const result = await controller.refresh(req, res);

    expect(service.refreshTokens).toHaveBeenCalledWith('old-uuid');
    expect(result).toEqual({ timezone: 'UTC' });
    expect(cookieMock).toHaveBeenCalledWith('access_token', 'new-jwt', expect.any(Object));
    expect(cookieMock).toHaveBeenCalledWith('refresh_token', 'new-uuid', expect.any(Object));
  });

  it('returns 401 when refresh cookie is missing', async () => {
    const req = { cookies: {} } as any;
    await expect(controller.refresh(req, res)).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
docker compose exec res-api-core pnpm test -- auth.controller.spec
```

Expected: FAIL — controller still accepts body DTO.

- [ ] **Step 3: Replace refresh handler in `auth.controller.ts`**

Replace the existing refresh route with:

```ts
@Post('refresh')
@ApiOperation({ summary: 'Rotate auth cookies using the refresh cookie' })
@ApiResponse({ status: 201, description: 'Rotation successful — cookies refreshed', type: AuthLoginResponseDto })
@ApiResponse({ status: 401, description: 'Refresh cookie missing, invalid, or expired' })
async refresh(
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
): Promise<AuthLoginResponseDto> {
  const refreshCookie = req.cookies?.[COOKIE_NAMES.refresh] as string | undefined;
  if (!refreshCookie) {
    throw new UnauthorizedException('REFRESH_TOKEN_MISSING');
  }

  const { accessToken, refreshToken, timezone } =
    await this.authService.refreshTokens(refreshCookie);

  res.cookie(
    COOKIE_NAMES.access,
    accessToken,
    buildAccessCookieOptions({
      domain: this.cfg.cookieDomain,
      secure: this.cfg.cookieSecure,
      accessMaxAge: this.cfg.cookieAccessMaxAge,
    }),
  );
  res.cookie(
    COOKIE_NAMES.refresh,
    refreshToken,
    buildRefreshCookieOptions({
      domain: this.cfg.cookieDomain,
      secure: this.cfg.cookieSecure,
      refreshMaxAge: this.cfg.cookieRefreshMaxAge,
    }),
  );

  return { timezone };
}
```

Add imports: `Req, UnauthorizedException` from `@nestjs/common`, `Request` from `express`.

- [ ] **Step 4: Delete `refresh-token.dto.ts`**

```bash
git rm apps/api-core/src/auth/dto/refresh-token.dto.ts
```

- [ ] **Step 5: Run, verify pass**

```bash
docker compose exec res-api-core pnpm test -- auth.controller.spec
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/auth/auth.controller.ts apps/api-core/src/auth/auth.controller.spec.ts apps/api-core/src/auth/dto/refresh-token.dto.ts
git commit -m "feat(auth): refresh reads cookie, rejects body input (H-04)"
```

---

## Task 6: AuthController.logout clears cookies

**Files:**
- Modify: `apps/api-core/src/auth/auth.controller.ts`
- Modify: `apps/api-core/src/auth/auth.controller.spec.ts`

- [ ] **Step 1: Write failing test**

Add to `auth.controller.spec.ts`:

```ts
describe('AuthController.logout', () => {
  let controller: AuthController;
  let service: AuthService;
  const clearMock = jest.fn();
  const res = { clearCookie: clearMock } as unknown as Response;

  beforeEach(async () => {
    clearMock.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { revokeAllTokens: jest.fn().mockResolvedValue(undefined) } },
        { provide: authConfig.KEY, useValue: { cookieDomain: '.daikulab.com', cookieSecure: true, cookieAccessMaxAge: 900_000, cookieRefreshMaxAge: 604_800_000 } },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
    service = moduleRef.get(AuthService);
  });

  it('revokes refresh tokens and clears both cookies with matching paths', async () => {
    await controller.logout({ id: 'u1' }, res);
    expect(service.revokeAllTokens).toHaveBeenCalledWith('u1');
    expect(clearMock).toHaveBeenCalledWith('access_token', expect.objectContaining({ path: '/', domain: '.daikulab.com' }));
    expect(clearMock).toHaveBeenCalledWith('refresh_token', expect.objectContaining({ path: '/v1/auth', domain: '.daikulab.com' }));
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
docker compose exec res-api-core pnpm test -- auth.controller.spec
```

Expected: FAIL — current logout has no `res` param.

- [ ] **Step 3: Replace logout in `auth.controller.ts`**

```ts
@Post('logout')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Revoke all refresh tokens and clear auth cookies' })
@ApiResponse({ status: 201, description: 'Logout successful', type: LogoutResponseDto })
async logout(
  @CurrentUser() user: { id: string },
  @Res({ passthrough: true }) res: Response,
): Promise<LogoutResponseDto> {
  await this.authService.revokeAllTokens(user.id);

  res.clearCookie(
    COOKIE_NAMES.access,
    buildClearOptions({
      domain: this.cfg.cookieDomain,
      secure: this.cfg.cookieSecure,
      name: 'access',
    }),
  );
  res.clearCookie(
    COOKIE_NAMES.refresh,
    buildClearOptions({
      domain: this.cfg.cookieDomain,
      secure: this.cfg.cookieSecure,
      name: 'refresh',
    }),
  );

  return { message: 'Logged out successfully' };
}
```

Add `buildClearOptions` to the imports from `./cookies/auth-cookies`.

- [ ] **Step 4: Run, verify pass**

```bash
docker compose exec res-api-core pnpm test -- auth.controller.spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/auth/auth.controller.ts apps/api-core/src/auth/auth.controller.spec.ts
git commit -m "feat(auth): logout clears auth cookies (H-04)"
```

---

## Task 7: CsrfOriginGuard (new) + global registration

**Files:**
- Create: `apps/api-core/src/auth/guards/csrf-origin.guard.ts`
- Create: `apps/api-core/src/auth/guards/csrf-origin.guard.spec.ts`
- Modify: `apps/api-core/src/app.module.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api-core/src/auth/guards/csrf-origin.guard.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfOriginGuard } from './csrf-origin.guard';

function ctx(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

describe('CsrfOriginGuard', () => {
  const allowed = ['https://resapp.daikulab.com'];
  let guard: CsrfOriginGuard;
  beforeEach(() => {
    guard = new CsrfOriginGuard({ corsAllowedOrigins: allowed } as any);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows safe method %s with no Origin', (method) => {
    expect(guard.canActivate(ctx({ method, headers: {} }))).toBe(true);
  });

  it('allows POST with allowlisted Origin', () => {
    expect(guard.canActivate(ctx({
      method: 'POST',
      headers: { origin: 'https://resapp.daikulab.com' },
    }))).toBe(true);
  });

  it('rejects POST with foreign Origin', () => {
    expect(() => guard.canActivate(ctx({
      method: 'POST',
      headers: { origin: 'https://malicioso.com' },
    }))).toThrow(ForbiddenException);
  });

  it('rejects POST without Origin or Referer', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', headers: {} }))).toThrow(ForbiddenException);
  });

  it('falls back to Referer origin when Origin is missing', () => {
    expect(guard.canActivate(ctx({
      method: 'POST',
      headers: { referer: 'https://resapp.daikulab.com/dash/orders' },
    }))).toBe(true);
  });

  it('rejects POST with malformed Referer and no Origin', () => {
    expect(() => guard.canActivate(ctx({
      method: 'POST',
      headers: { referer: 'not-a-url' },
    }))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
docker compose exec res-api-core pnpm test -- csrf-origin.guard.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement guard**

Create `apps/api-core/src/auth/guards/csrf-origin.guard.ts`:

```ts
import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';

import { csrfConfig } from '../csrf.config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(
    @Inject(csrfConfig.KEY)
    cfg: ConfigType<typeof csrfConfig>,
  ) {
    this.allowed = new Set(cfg.corsAllowedOrigins);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = this.resolveOrigin(req);
    if (!origin) throw new ForbiddenException({ code: 'ORIGIN_REQUIRED' });
    if (!this.allowed.has(origin)) {
      throw new ForbiddenException({ code: 'ORIGIN_NOT_ALLOWED' });
    }
    return true;
  }

  private resolveOrigin(req: Request): string | null {
    const headerOrigin = req.headers.origin;
    if (typeof headerOrigin === 'string' && headerOrigin.length > 0) return headerOrigin;
    const referer = req.headers.referer;
    if (typeof referer !== 'string') return null;
    try { return new URL(referer).origin; } catch { return null; }
  }
}
```

- [ ] **Step 4: Create `csrfConfig`**

Create `apps/api-core/src/auth/csrf.config.ts`:

```ts
import { registerAs } from '@nestjs/config';
import { CORS_ORIGIN } from '../config';

export const csrfConfig = registerAs('csrf', () => ({
  corsAllowedOrigins: CORS_ORIGIN,
}));
```

- [ ] **Step 5: Register guard globally in `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
// ... other imports
import { CsrfOriginGuard } from './auth/guards/csrf-origin.guard';
import { csrfConfig } from './auth/csrf.config';

@Module({
  imports: [
    ConfigModule.forRoot({ validate, load: [csrfConfig] }),
    // ... rest
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: CsrfOriginGuard }],
})
export class AppModule {}
```

- [ ] **Step 6: Run unit test, verify pass**

```bash
docker compose exec res-api-core pnpm test -- csrf-origin.guard.spec
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/auth/guards/csrf-origin.guard.ts apps/api-core/src/auth/guards/csrf-origin.guard.spec.ts apps/api-core/src/auth/csrf.config.ts apps/api-core/src/app.module.ts
git commit -m "feat(auth): add CsrfOriginGuard with Origin allowlist (H-04)"
```

---

## Task 8: EventsController.dashboard reads cookie

**Files:**
- Modify: `apps/api-core/src/events/events.controller.ts`

- [ ] **Step 1: Update the dashboard handler**

```ts
import { Controller, MessageEvent, Query, Sse, UnauthorizedException, UseGuards, Headers } from '@nestjs/common';
import { Observable } from 'rxjs';

import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { SseService } from './sse.service';
import { KitchenTokenService, MAX_KITCHEN_TOKEN_LENGTH } from '../kitchen/kitchen-token.service';

@Controller({ version: '1', path: 'events' })
export class EventsController {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly sseService: SseService,
    private readonly kitchenTokenService: KitchenTokenService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Sse('dashboard')
  dashboard(@CurrentUser() user: { restaurantId: string }): Observable<MessageEvent> {
    return this.sseService.streamForRestaurant(user.restaurantId);
  }

  @Public()
  @Sse('kitchen')
  async kitchen(
    @Headers('x-kitchen-token') token: string | undefined,
    @Query('slug') slug: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    if (!slug || !token) throw new UnauthorizedException();
    if (token.length > MAX_KITCHEN_TOKEN_LENGTH) throw new UnauthorizedException();

    const restaurant = await this.restaurantsService.findBySlugWithSettings(slug);
    if (!restaurant?.settings) throw new UnauthorizedException();

    const storedHash = restaurant.settings.kitchenTokenHash;
    if (!storedHash) throw new UnauthorizedException();

    const candidateHash = this.kitchenTokenService.hash(token);
    if (!this.kitchenTokenService.verifyHash(storedHash, candidateHash)) {
      throw new UnauthorizedException();
    }

    const expiresAt = restaurant.settings.kitchenTokenExpiresAt;
    if (expiresAt && expiresAt < new Date()) throw new UnauthorizedException();

    return this.sseService.streamForKitchen(restaurant.id);
  }
}
```

Remove `JwtService` import + constructor entry — no longer needed.

- [ ] **Step 2: Verify the module wiring**

Open `apps/api-core/src/events/events.module.ts` and remove `JwtService` provider if it was only there for this controller. If it's used by other providers, leave it.

- [ ] **Step 3: Type-check**

```bash
docker compose exec res-api-core pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/events/events.controller.ts apps/api-core/src/events/events.module.ts
git commit -m "refactor(events): dashboard SSE uses JwtAuthGuard cookie, kitchen reads X-Kitchen-Token header (H-04)"
```

---

## Task 9: KitchenTokenGuard header-only

**Files:**
- Modify: `apps/api-core/src/kitchen/guards/kitchen-token.guard.ts`
- Modify: `apps/api-core/src/kitchen/guards/kitchen-token.guard.spec.ts` (if exists; otherwise create)

- [ ] **Step 1: Update or create the spec**

Confirm/replace test in `kitchen-token.guard.spec.ts`:

```ts
it('rejects when the kitchen token is only present in ?token= query', async () => {
  // ... existing setup that puts token in query and not header
  const req = { params: { slug }, query: { token: 'raw-token' }, headers: {} } as any;
  await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as any))
    .rejects.toThrow(UnauthorizedException);
});

it('accepts X-Kitchen-Token header', async () => {
  // ... existing setup
  const req = { params: { slug }, query: {}, headers: { 'x-kitchen-token': 'raw-token' } } as any;
  await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as any))
    .resolves.toBe(true);
});
```

- [ ] **Step 2: Run, verify the "only query" test fails**

```bash
docker compose exec res-api-core pnpm test -- kitchen-token.guard.spec
```

Expected: query-only test passes (current code allows it), header test passes — confirming we need to remove the fallback.

- [ ] **Step 3: Remove query fallback in `kitchen-token.guard.ts`**

Replace `extractToken`:

```ts
private extractToken(req: Request): string | undefined {
  const header = req.headers['x-kitchen-token'];
  if (typeof header === 'string' && header.length > 0) return header;
  return undefined;
}
```

Update the JSDoc above it to: "Kitchen token is read from `X-Kitchen-Token` only. Query-string token (legacy) was removed in the H-04 migration to keep secrets out of URLs."

- [ ] **Step 4: Run, verify both spec cases pass**

```bash
docker compose exec res-api-core pnpm test -- kitchen-token.guard.spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/kitchen/guards/kitchen-token.guard.ts apps/api-core/src/kitchen/guards/kitchen-token.guard.spec.ts
git commit -m "refactor(kitchen): drop query-string token fallback in guard (H-04)"
```

---

## Task 10: E2E auth cookie helper

**Files:**
- Create: `apps/api-core/test/helpers/auth-cookie.ts`

- [ ] **Step 1: Implement helper**

Create `apps/api-core/test/helpers/auth-cookie.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';

const ALLOWED_ORIGIN = 'http://localhost:4321';

/**
 * Logs in and returns the raw access_token cookie string suitable for
 * `request(app).get(...).set('Cookie', cookie)`. The Origin header is set to
 * the dev allowlist value so CsrfOriginGuard does not reject the request.
 */
export async function loginCookie(
  app: INestApplication<App>,
  email: string,
  password = 'Admin1234!',
): Promise<{ accessCookie: string; refreshCookie: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .set('Origin', ALLOWED_ORIGIN)
    .send({ email, password });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  if (!Array.isArray(setCookie)) {
    throw new Error('Login did not return Set-Cookie headers');
  }
  const accessCookie = setCookie.find((c) => c.startsWith('access_token='));
  const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='));
  if (!accessCookie || !refreshCookie) {
    throw new Error(`Missing auth cookies in Set-Cookie: ${setCookie.join(' | ')}`);
  }

  return {
    accessCookie: accessCookie.split(';')[0]!,
    refreshCookie: refreshCookie.split(';')[0]!,
  };
}

export const AUTH_ORIGIN_HEADER = ['Origin', ALLOWED_ORIGIN] as const;
```

- [ ] **Step 2: Update `test/auth/helpers.ts` `bootstrapApp` to add cookie-parser**

Update both auth helper and `test/orders/orders.helpers.ts` (and any other duplicates) so the test Nest app also calls `app.use(cookieParser())`:

```ts
import cookieParser from 'cookie-parser';
// inside bootstrapApp, after createNestApplication:
app.use(cookieParser());
app.enableVersioning({ type: VersioningType.URI });
```

Search the test/ tree to update every `bootstrapApp` (or shared variant) — at minimum: `test/auth/helpers.ts`, `test/orders/orders.helpers.ts`, `test/cash-register/cash-register.helpers.ts`, `test/kiosk/kiosk.helpers.ts`, `test/kitchen/kitchen.helpers.ts`, `test/uploads/uploads.helpers.ts`, `test/menus/`, `test/products/`. Use:

```bash
grep -rln "bootstrapApp" apps/api-core/test
```

- [ ] **Step 3: Update existing `login()` helpers to use cookies**

Where helpers (e.g. `test/orders/orders.helpers.ts:login`) return an `accessToken` string, refactor to return the cookie pair from `loginCookie()`. Update call sites accordingly (Task 11 will sweep them).

For helpers that must keep returning a string for back-compat during the transition, return the `accessCookie` value directly so callers can pass it to `.set('Cookie', cookie)`. Prefer the full refactor.

- [ ] **Step 4: Commit (helper only, tests still red)**

```bash
git add apps/api-core/test/helpers/auth-cookie.ts apps/api-core/test/auth/helpers.ts apps/api-core/test/orders/orders.helpers.ts apps/api-core/test/cash-register/cash-register.helpers.ts apps/api-core/test/kiosk/kiosk.helpers.ts apps/api-core/test/kitchen/kitchen.helpers.ts apps/api-core/test/uploads/uploads.helpers.ts apps/api-core/test/menus apps/api-core/test/products
git commit -m "test(auth): add cookie login helper and wire cookieParser in test app (H-04)"
```

---

## Task 11: Migrate e2e tests from Bearer to Cookie

**Files:**
- Modify: every file matching `apps/api-core/test/**/*.e2e-spec.ts` that uses `set('Authorization', ...)` or relies on `login()` returning a Bearer token.

> There are ~358 occurrences across ~30 files. Do this file-by-file to keep commits reviewable.

- [ ] **Step 1: Inventory the work**

```bash
grep -rl "set('Authorization'" apps/api-core/test
```

Save the list. For each file:

1. Replace `const token = await login(app, email);` with `const { accessCookie } = await loginCookie(app, email);`.
2. Replace every `.set('Authorization', \`Bearer ${token}\`)` with `.set('Cookie', accessCookie).set('Origin', 'http://localhost:4321')`.
3. For tests that intentionally check **no auth → 401**, also drop the `Authorization` header.
4. For tests that intentionally check **wrong Origin → 403**, add a new case if relevant to that file.

- [ ] **Step 2: Process files in batches and run after each batch**

After every 3-5 files:
```bash
docker compose exec res-api-core pnpm test:e2e -- <batch-pattern>
```

Expected: green for that batch.

- [ ] **Step 3: Add a regression test in `auth.e2e-spec.ts`**

If no `auth.e2e-spec.ts` exists, create `apps/api-core/test/auth/login.e2e-spec.ts`:

```ts
it('rejects requests with Authorization: Bearer (legacy)', async () => {
  const { accessCookie } = await loginCookie(app, email);
  // Use the raw JWT from the cookie value
  const jwt = accessCookie.split('=')[1]!.split(';')[0]!;

  const withCookie = await request(app.getHttpServer())
    .get('/v1/auth/me')
    .set('Cookie', accessCookie)
    .set('Origin', 'http://localhost:4321');
  expect(withCookie.status).toBe(200);

  const withBearer = await request(app.getHttpServer())
    .get('/v1/auth/me')
    .set('Authorization', `Bearer ${jwt}`)
    .set('Origin', 'http://localhost:4321');
  expect(withBearer.status).toBe(401);
});
```

- [ ] **Step 4: Full e2e run**

```bash
docker compose exec res-api-core pnpm test:e2e
```

Expected: all green. Investigate any failures before moving on.

- [ ] **Step 5: Commit per batch**

Suggested commits (one per directory):
```bash
git add apps/api-core/test/products
git commit -m "test(products): migrate e2e to cookie auth (H-04)"

git add apps/api-core/test/cash-register
git commit -m "test(cash-register): migrate e2e to cookie auth (H-04)"

# ... continue per directory
```

---

## Task 12: CSRF e2e suite

**Files:**
- Create: `apps/api-core/test/csrf.e2e-spec.ts`

- [ ] **Step 1: Write the e2e spec**

```ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  bootstrapApp, uniqueEmail, registerUser, activateUser,
} from './auth/helpers';
import { loginCookie } from './helpers/auth-cookie';

describe('CSRF Origin enforcement (e2e)', () => {
  let app: INestApplication<App>;
  let accessCookie: string;
  const email = uniqueEmail('csrf');

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    await registerUser(app, email);
    await activateUser(app, boot.prisma, email);
    ({ accessCookie } = await loginCookie(app, email, 'Password123'));
  });

  afterAll(async () => { await app.close(); });

  it('GET without Origin is allowed', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Cookie', accessCookie);
    expect(res.status).toBe(200);
  });

  it('POST with allowlisted Origin passes', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', accessCookie)
      .set('Origin', 'http://localhost:4321');
    expect([200, 201]).toContain(res.status);
  });

  it('POST with foreign Origin is rejected with 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', accessCookie)
      .set('Origin', 'https://malicioso.com');
    expect(res.status).toBe(403);
  });

  it('POST without Origin or Referer is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', accessCookie);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run**

```bash
docker compose exec res-api-core pnpm test:e2e -- csrf
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/csrf.e2e-spec.ts
git commit -m "test(auth): add CSRF Origin enforcement e2e suite (H-04)"
```

---

## Task 13: Frontend — `lib/auth.ts` minimal surface

**Files:**
- Modify: `apps/ui/src/lib/auth.ts`
- Modify: `apps/ui/src/config.ts` (only if needed — check there's an `apiUrl`)

- [ ] **Step 1: Replace the file**

Replace `apps/ui/src/lib/auth.ts` with:

```ts
import { config } from '../config';

const TIMEZONE_KEY = 'restaurantTimezone';

export function getRestaurantTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) ?? 'UTC';
}

export function setRestaurantTimezone(timezone: string): void {
  localStorage.setItem(TIMEZONE_KEY, timezone);
}

export function clearLocalAuthState(): void {
  localStorage.removeItem(TIMEZONE_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const res = await fetch(`${config.apiUrl}/v1/auth/me`, { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}
```

`getAccessToken`, `getRefreshToken`, `setTokens`, `clearTokens` are removed.

- [ ] **Step 2: Commit (UI build will be red until tasks 14-17)**

```bash
git add apps/ui/src/lib/auth.ts
git commit -m "refactor(ui): reduce auth lib to timezone + async isAuthenticated (H-04)"
```

---

## Task 14: Frontend — `lib/api.ts` with credentials

**Files:**
- Modify: `apps/ui/src/lib/api.ts`

- [ ] **Step 1: Replace the file**

```ts
import { config } from '../config';

const API_URL = config.apiUrl;

// Singleton of the in-flight refresh request (audit H-49). Multiple concurrent
// `apiFetch` calls that hit 401 simultaneously would otherwise fire N parallel
// `POST /v1/auth/refresh`, burning N refresh-token rotations on the backend.
// Sharing one promise means the second/third caller awaits the first.
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  return response.ok;
}

function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const init: RequestInit = { ...options, headers, credentials: 'include' };

  let response = await fetch(`${API_URL}${path}`, init);

  if (response.status === 401 && !path.startsWith('/v1/auth/')) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await fetch(`${API_URL}${path}`, init);
    } else {
      window.location.href = '/login';
    }
  }

  return response;
}
```

- [ ] **Step 2: Type-check the UI**

```bash
docker compose exec res-ui pnpm exec astro check 2>&1 | head -50
```

Expected: errors only for files that still import the removed helpers (login.astro, OrdersPanel, etc.) — fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/lib/api.ts
git commit -m "refactor(ui): apiFetch uses credentials:include, refresh body removed (H-04)"
```

---

## Task 15: Frontend — login page

**Files:**
- Modify: `apps/ui/src/pages/login.astro`

- [ ] **Step 1: Update the inline script**

Replace the `<script>` block:

```astro
<script>
  import { config } from '../config';
  import { isAuthenticated, setRestaurantTimezone } from '../lib/auth';
  import { getErrorMessage } from '../lib/error-messages';

  // Redirect if already authenticated
  if (await isAuthenticated()) {
    window.location.href = '/dash';
  }

  const API_URL = config.apiUrl;

  const loginForm = document.getElementById('loginForm') as HTMLFormElement;
  const loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;
  const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
  const closeError = document.getElementById('closeError') as HTMLButtonElement;

  function setLoading(loading: boolean) {
    loadingOverlay.classList.toggle('visible', loading);
  }

  function showError(message: string) {
    const errorP = errorMessage.querySelector('p') as HTMLParagraphElement;
    errorP.textContent = message;
    errorMessage.classList.add('visible');
    setTimeout(() => errorMessage.classList.remove('visible'), 5000);
  }

  closeError.addEventListener('click', () => errorMessage.classList.remove('visible'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;
    if (!email || !password) { showError('Por favor completa todos los campos'); return; }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        showError(errorData?.code ? getErrorMessage(errorData.code) : 'Error al iniciar sesión');
        return;
      }

      const result = await response.json();
      setRestaurantTimezone(result.timezone ?? 'UTC');
      window.location.href = '/dash';
    } catch (error) {
      console.error('Login error:', error);
      showError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/pages/login.astro
git commit -m "refactor(ui): login posts with credentials, no localStorage tokens (H-04)"
```

---

## Task 16: Frontend — logout posts and clears state

**Files:**
- Modify: `apps/ui/src/layouts/DashboardLayout.astro`

- [ ] **Step 1: Update the logout script**

Replace the `<script>` block:

```astro
<script>
  import { config } from '../config';
  import { clearLocalAuthState } from '../lib/auth';

  const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch(`${config.apiUrl}/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // best-effort — proceed to local cleanup regardless
    }
    clearLocalAuthState();
    window.location.href = '/login';
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/layouts/DashboardLayout.astro
git commit -m "refactor(ui): logout calls backend then clears local state (H-04)"
```

---

## Task 17: Frontend — ProtectedLayout async auth check

**Files:**
- Modify: `apps/ui/src/layouts/ProtectedLayout.astro`

- [ ] **Step 1: Replace the script**

```astro
<script>
  import { isAuthenticated } from '../lib/auth';

  (async () => {
    if (!(await isAuthenticated())) {
      window.location.href = '/login';
    }
  })();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/layouts/ProtectedLayout.astro
git commit -m "refactor(ui): ProtectedLayout uses async isAuthenticated (H-04)"
```

---

## Task 18: Frontend — OrdersPanel EventSource with credentials

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.tsx`
- Modify: `apps/ui/src/components/dash/orders/OrdersPanel.test.tsx`

- [ ] **Step 1: Update the test first**

Open `OrdersPanel.test.tsx` and adjust the SSE assertion: the new EventSource is created with no token in the URL and `{ withCredentials: true }`. Remove any mock of `getAccessToken`.

```ts
expect(EventSource).toHaveBeenCalledWith(
  expect.stringMatching(/\/v1\/events\/dashboard$/),
  expect.objectContaining({ withCredentials: true }),
);
```

- [ ] **Step 2: Update the component**

In `OrdersPanel.tsx`:
1. Remove `import { getAccessToken } from '../../../lib/auth';`.
2. Replace the SSE useEffect body with:

```tsx
useEffect(() => {
  if (status !== ORDERS_STATUS.OPEN || !session) return;
  const es = new EventSource(`${config.apiUrl}/v1/events/dashboard`, { withCredentials: true });
  const reload = () => {
    if (!activeFilterRef.current) fetchOrders(null);
  };
  es.addEventListener(ORDER_EVENTS.NEW, reload);
  es.addEventListener(ORDER_EVENTS.UPDATED, reload);
  return () => es.close();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [status, session]);
```

- [ ] **Step 3: Run UI tests**

```bash
docker compose exec res-ui pnpm test -- OrdersPanel
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrdersPanel.tsx apps/ui/src/components/dash/orders/OrdersPanel.test.tsx
git commit -m "refactor(ui): dashboard SSE uses cookie (withCredentials), no token in URL (H-04)"
```

---

## Task 19: Frontend — Kitchen page header migration

**Files:**
- Modify: `apps/ui/package.json`
- Modify: `apps/ui/src/pages/kitchen/index.astro`

- [ ] **Step 1: Install `@microsoft/fetch-event-source`**

```bash
docker compose exec res-ui pnpm add @microsoft/fetch-event-source
```

Expected: `apps/ui/package.json` lists the dep.

- [ ] **Step 2: Replace `kitchenFetch` and the SSE block**

In `apps/ui/src/pages/kitchen/index.astro`, inside the `<script>` block:

1. Add top-level import:

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';
```

2. Replace `kitchenFetch`:

```ts
async function kitchenFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Kitchen-Token': token,
      ...(options.headers ?? {}),
    },
  });
}
```

3. Replace the SSE block (the `const es = new EventSource(...)` chunk and the `beforeunload` close) with:

```ts
const sseController = new AbortController();
window.addEventListener('beforeunload', () => sseController.abort());

// NOTE: do NOT await — fetchEventSource resolves only when the stream closes,
// so awaiting would block all the listener registrations and the initial load
// that follow this block.
fetchEventSource(`${API_URL}/v1/events/kitchen?slug=${encodeURIComponent(slug)}`, {
  headers: { 'X-Kitchen-Token': token },
  signal: sseController.signal,
  openWhenHidden: true,
  async onopen(response) {
    if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
      setConnected();
      loadOrders();
      return;
    }
    setOffline();
    throw new Error(`SSE open failed: ${response.status}`);
  },
  onerror() { setOffline(); /* allow library to retry */ },
  onmessage(msg) {
    if (msg.event === ORDER_EVENTS.NEW || msg.event === ORDER_EVENTS.UPDATED) loadOrders();
  },
}).catch(() => setOffline());

// Reload after confirmation modal confirms a SERVED transition
window.addEventListener('kitchen:order-updated', () => loadOrders());
loadOrders();
```

Remove the legacy `es.onopen`, `es.onerror`, `es.addEventListener`, and `beforeunload` lines for `es`.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/package.json pnpm-lock.yaml apps/ui/src/pages/kitchen/index.astro
git commit -m "refactor(ui): kitchen SSE + REST use X-Kitchen-Token header (H-04)"
```

---

## Task 20: Frontend — KitchenConfirmModal header

**Files:**
- Modify: `apps/ui/src/components/kitchen/KitchenConfirmModal.tsx`

- [ ] **Step 1: Replace the fetch call**

```tsx
const res = await fetch(
  `${config.apiUrl}/v1/kitchen/${slug}/orders/${order.orderId}/status`,
  {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Kitchen-Token': token,
    },
    body: JSON.stringify({ status: 'SERVED' }),
    signal: controller.signal,
  },
);
```

- [ ] **Step 2: Run the modal test (it should still pass — token now in header)**

```bash
docker compose exec res-ui pnpm test -- KitchenConfirmModal
```

Update any assertion that inspects the URL to check the header instead.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/kitchen/KitchenConfirmModal.tsx
git commit -m "refactor(ui): KitchenConfirmModal sends X-Kitchen-Token header (H-04)"
```

---

## Task 21: Full smoke + verification

**Files:** none (verification only)

- [ ] **Step 1: Backend unit + e2e green**

```bash
docker compose exec res-api-core pnpm test
docker compose exec res-api-core pnpm test:e2e
```

Expected: all green.

- [ ] **Step 2: Frontend tests + type-check + build**

```bash
docker compose exec res-ui pnpm test
docker compose exec res-ui pnpm exec astro check
docker compose exec res-ui pnpm build
```

Expected: all green; build succeeds.

- [ ] **Step 3: Manual smoke in browser (per spec §Testing strategy)**

Start `docker compose up`, then in the browser:
1. Login at `http://localhost:4321/login`. Confirm DevTools → Application → Cookies shows `access_token` + `refresh_token`, both `HttpOnly`, `SameSite=Lax`, with no domain attribute.
2. Open `/dash/orders` and confirm SSE connects (`/v1/events/dashboard` request with no token in URL, returning text/event-stream).
3. Create a kiosk order from `/kiosk?slug=...`. Watch the dashboard refresh via SSE.
4. Open `/dash/kitchen`, copy a fresh kitchen token URL, paste into a new tab `http://localhost:4321/kitchen?slug=...&token=...`. Confirm the token is stored in sessionStorage and the SSE call to `/v1/events/kitchen?slug=...` has the `X-Kitchen-Token` header set (DevTools → Network → Headers).
5. From the dashboard, click logout. Confirm cookies are cleared and `/dash/orders` redirects to `/login`.
6. From devtools console while logged in: `await fetch('http://localhost:3000/v1/auth/me', { credentials: 'include', method: 'GET', headers: { Authorization: 'Bearer dummy' } })` → should return 200 anyway (we ignore Bearer and use cookie); without `credentials: 'include'` → 401.

Document any discrepancy back to the spec before continuing.

- [ ] **Step 4: No commit** (verification step).

---

## Task 22: Documentation — environments + audit closure

**Files:**
- Modify: `apps/api-core/docs/environments.md`
- Modify: `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`
- Modify: `apps/ui/README.md`

- [ ] **Step 1: Add cookie env vars to `environments.md`**

Document `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_ACCESS_MAX_AGE`, `COOKIE_REFRESH_MAX_AGE`, `CORS_ORIGIN` with prod/dev examples per spec §CORS, Cloudflare y entornos.

- [ ] **Step 2: Mark H-04 ✅ in the audit findings file**

Open `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`, find the H-04 entry, change its status to ✅ Resuelto with a reference to this plan and the corresponding ADR.

- [ ] **Step 3: Note the cookie auth flow in `apps/ui/README.md`**

Add a short subsection describing that auth uses httpOnly cookies and that all fetches must use `credentials: 'include'` (and that `apiFetch` already does so).

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/docs/environments.md apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md apps/ui/README.md
git commit -m "docs(auth): document cookie env vars, close H-04, note frontend flow"
```

---

## Task 23: ADR-0001

**Files:**
- Create: `apps/api-core/docs/adr/README.md`
- Create: `apps/api-core/docs/adr/0001-cookie-httponly-auth.md`

- [ ] **Step 1: Create the ADR index**

`apps/api-core/docs/adr/README.md`:

```markdown
# ADRs — apps/api-core

Architecture Decision Records: registro inmutable de decisiones arquitectónicas significativas.

Convenciones:
- Numeración secuencial de 4 dígitos: `0001-`, `0002-`, etc.
- Nombre kebab-case descriptivo: `0001-cookie-httponly-auth.md`.
- Cada ADR es inmutable una vez aceptado. Cambios → nuevo ADR que supersede el anterior.

| # | Título | Estado | Fecha |
|---|--------|--------|-------|
| 0001 | [Autenticación por cookies httpOnly](./0001-cookie-httponly-auth.md) | Aceptado | 2026-05-30 |
```

- [ ] **Step 2: Create the ADR body**

`apps/api-core/docs/adr/0001-cookie-httponly-auth.md`: cover Contexto, Decisión, Consecuencias (positivas/negativas), Alternativas consideradas, Referencias — per spec §ADR.

Use the real merged commits and resulting file paths (not the spec drafts) so the ADR reflects the implementation.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/docs/adr/
git commit -m "docs(adr): record 0001 cookie httpOnly auth decision"
```

---

## Final checklist (run after all tasks)

- [ ] `docker compose exec res-api-core pnpm test` green
- [ ] `docker compose exec res-api-core pnpm test:e2e` green
- [ ] `docker compose exec res-ui pnpm test` green
- [ ] `docker compose exec res-ui pnpm exec astro check` clean
- [ ] `docker compose exec res-ui pnpm build` succeeds
- [ ] Manual smoke (Task 21) completed
- [ ] No `Authorization: Bearer` references remain in `apps/`: `grep -r "Authorization.*Bearer\|fromAuthHeaderAsBearerToken" apps/api-core/src apps/ui/src` returns nothing meaningful
- [ ] No `getAccessToken\|getRefreshToken\|setTokens\|clearTokens` references remain in `apps/ui/src`
- [ ] No `?token=` references remain in `apps/ui/src` for `/v1/events/` or `/v1/kitchen/`
- [ ] PR description references the spec and this plan
