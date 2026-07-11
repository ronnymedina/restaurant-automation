# Onboarding Resend Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /v1/onboarding/resend-activation` so unactivated users can request a new activation email, with rate limiting per email address (3 requests / 15 min).

**Architecture:** A new public endpoint in `OnboardingController` delegates to a new `resendActivation(email)` method in `OnboardingService`. The method looks up the user, validates state, regenerates the activation token, and sends the email. A custom `EmailThrottlerGuard` overrides the default IP-based throttling to use the email from the request body as the throttle key.

**Tech Stack:** NestJS, `@nestjs/throttler` v6, Prisma, Jest, Supertest

---

## File Map

| Action | File |
|---|---|
| Modify | `src/onboarding/exceptions/onboarding.exceptions.ts` |
| Modify | `src/users/users.service.ts` |
| Modify | `src/onboarding/onboarding.service.ts` |
| Modify | `src/onboarding/onboarding.service.spec.ts` |
| Create | `src/onboarding/guards/email-throttler.guard.ts` |
| Create | `src/onboarding/dto/resend-activation.dto.ts` |
| Modify | `src/onboarding/dto/index.ts` |
| Modify | `src/onboarding/onboarding.controller.ts` |
| Create | `test/onboarding/resend-activation.e2e-spec.ts` |
| Modify | `src/onboarding/onboarding.module.info.md` |

---

### Task 1: Add exceptions

**Files:**
- Modify: `apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts`

- [ ] **Step 1: Add `UserNotFoundException` and `UserAlreadyActiveException`**

Append to the end of the file (after `UserCreationFailedException`):

```typescript
/**
 * Thrown when resend-activation is called for an email that is not registered.
 */
export class UserNotFoundException extends BaseException {
  constructor(email: string) {
    super(
      `No account found for email '${email}'`,
      HttpStatus.NOT_FOUND,
      'USER_NOT_FOUND',
      { email },
    );
  }
}

/**
 * Thrown when resend-activation is called for a user that is already active.
 */
export class UserAlreadyActiveException extends BaseException {
  constructor(email: string) {
    super(
      `Account for '${email}' is already active`,
      HttpStatus.CONFLICT,
      'USER_ALREADY_ACTIVE',
      { email },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/onboarding/exceptions/onboarding.exceptions.ts
git commit -m "feat(onboarding): add UserNotFoundException and UserAlreadyActiveException"
```

---

### Task 2: Add `refreshActivationToken` to `UsersService`

**Files:**
- Modify: `apps/api-core/src/users/users.service.ts`

The `UserRepository.update()` method already accepts `Partial<CreateUserData>` which includes `activationToken`. No repository changes needed.

- [ ] **Step 1: Add method to `UsersService`**

Add after the `findByEmail` method (around line 134):

```typescript
async refreshActivationToken(userId: string, token: string): Promise<void> {
  await this.userRepository.update(userId, { activationToken: token });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/users/users.service.ts
git commit -m "feat(users): add refreshActivationToken method"
```

---

### Task 3: Add `resendActivation` to `OnboardingService` with unit tests

**Files:**
- Modify: `apps/api-core/src/onboarding/onboarding.service.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.service.spec.ts`

- [ ] **Step 1: Add `refreshActivationToken` mock and import new exceptions in the spec**

In `onboarding.service.spec.ts`, update the `mockUsersService` object (around line 68):

```typescript
const mockUsersService = {
  findByEmail: jest.fn(),
  createOnboardingUser: jest.fn(),
  refreshActivationToken: jest.fn(),
};
```

Add the new exceptions to the import at the top of the spec:

```typescript
import {
  EmailAlreadyExistsException,
  RestaurantCreationFailedException,
  UserCreationFailedException,
  OnboardingFailedException,
  UserNotFoundException,
  UserAlreadyActiveException,
} from './exceptions/onboarding.exceptions';
```

- [ ] **Step 2: Add failing unit tests for `resendActivation`**

Append a new `describe` block at the end of the spec (before the closing `}`):

```typescript
// ─── resendActivation ────────────────────────────────────────────────────────

describe('resendActivation', () => {
  it('throws UserNotFoundException when email is not registered', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);

    await expect(service.resendActivation('unknown@test.com')).rejects.toThrow(
      UserNotFoundException,
    );

    expect(mockUsersService.refreshActivationToken).not.toHaveBeenCalled();
    expect(mockEmailService.sendActivationEmail).not.toHaveBeenCalled();
  });

  it('throws UserAlreadyActiveException when user is already active', async () => {
    mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: true });

    await expect(service.resendActivation(mockUser.email)).rejects.toThrow(
      UserAlreadyActiveException,
    );

    expect(mockUsersService.refreshActivationToken).not.toHaveBeenCalled();
    expect(mockEmailService.sendActivationEmail).not.toHaveBeenCalled();
  });

  it('regenerates token and sends activation email for inactive user', async () => {
    mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
    mockUsersService.refreshActivationToken.mockResolvedValue(undefined);
    mockEmailService.sendActivationEmail.mockResolvedValue(true);

    await service.resendActivation(mockUser.email);

    expect(mockUsersService.refreshActivationToken).toHaveBeenCalledWith(
      mockUser.id,
      expect.any(String),
    );
    expect(mockEmailService.sendActivationEmail).toHaveBeenCalledWith(
      mockUser.email,
      expect.any(String),
    );
    // Token passed to refreshActivationToken and sendActivationEmail must be the same
    const newToken = mockUsersService.refreshActivationToken.mock.calls[0][1] as string;
    expect(mockEmailService.sendActivationEmail).toHaveBeenCalledWith(mockUser.email, newToken);
  });

  it('completes without throwing when sendActivationEmail fails', async () => {
    mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
    mockUsersService.refreshActivationToken.mockResolvedValue(undefined);
    mockEmailService.sendActivationEmail.mockRejectedValue(new Error('SMTP error'));

    await expect(service.resendActivation(mockUser.email)).resolves.not.toThrow();
    expect(mockUsersService.refreshActivationToken).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=onboarding.service.spec
```

Expected: 4 failures in `resendActivation` describe block — `service.resendActivation is not a function`.

- [ ] **Step 4: Implement `resendActivation` in `OnboardingService`**

Add `import { randomUUID } from 'crypto';` to the top of `onboarding.service.ts` (after the NestJS imports line).

Add the new exceptions to the import in `onboarding.service.ts`:

```typescript
import {
  OnboardingFailedException,
  EmailAlreadyExistsException,
  RestaurantCreationFailedException,
  UserCreationFailedException,
  UserNotFoundException,
  UserAlreadyActiveException,
} from './exceptions/onboarding.exceptions';
```

Add the method at the end of the `OnboardingService` class (before the closing `}`):

```typescript
async resendActivation(email: string): Promise<void> {
  const user = await this.usersService.findByEmail(email);

  if (!user) {
    throw new UserNotFoundException(email);
  }

  if (user.isActive) {
    throw new UserAlreadyActiveException(email);
  }

  const newToken = randomUUID();
  await this.usersService.refreshActivationToken(user.id, newToken);

  try {
    const sent = await this.emailService.sendActivationEmail(email, newToken);
    if (!sent) {
      this.logger.warn(`Activation email could not be resent to ${email}`);
    }
  } catch (error) {
    this.logger.error(`Failed to resend activation email to ${email}`, error);
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern=onboarding.service.spec
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.service.ts \
        apps/api-core/src/onboarding/onboarding.service.spec.ts
git commit -m "feat(onboarding): add resendActivation method with unit tests"
```

---

### Task 4: Create `EmailThrottlerGuard`

**Files:**
- Create: `apps/api-core/src/onboarding/guards/email-throttler.guard.ts`

- [ ] **Step 1: Create the guard**

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class EmailThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req['body'] as { email?: string } | undefined;
    return body?.email ?? (req['ip'] as string) ?? 'unknown';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/onboarding/guards/email-throttler.guard.ts
git commit -m "feat(onboarding): add EmailThrottlerGuard keyed by email"
```

---

### Task 5: Add DTO and controller endpoint

**Files:**
- Create: `apps/api-core/src/onboarding/dto/resend-activation.dto.ts`
- Modify: `apps/api-core/src/onboarding/dto/index.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.controller.ts`

- [ ] **Step 1: Create `ResendActivationDto`**

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendActivationDto {
  @ApiProperty({ description: 'Email de la cuenta a activar', example: 'usuario@restaurante.com' })
  @IsEmail({}, { message: 'El email debe ser válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;
}
```

- [ ] **Step 2: Export from `dto/index.ts`**

Add to `apps/api-core/src/onboarding/dto/index.ts`:

```typescript
export { ResendActivationDto } from './resend-activation.dto';
```

- [ ] **Step 3: Add endpoint to the controller**

Add `ResendActivationDto` to the import line in `onboarding.controller.ts`:

```typescript
import { OnboardingRegisterDto, OnboardingRegisterSwaggerDto, ResendActivationDto } from './dto';
```

Add `EmailThrottlerGuard` import:

```typescript
import { EmailThrottlerGuard } from './guards/email-throttler.guard';
```

Append the new action inside `OnboardingController` (after the `register` method):

```typescript
@Public()
@UseGuards(EmailThrottlerGuard)
@Throttle({ default: { ttl: 900_000, limit: 3 } })
@Post('resend-activation')
@ApiOperation({
  summary: 'Reenviar email de activación',
  description: 'Reenvía el email de activación a una cuenta no confirmada. Regenera el token.',
})
@ApiResponse({ status: 200, description: 'Email de activación enviado' })
@ApiResponse({ status: 404, description: 'Email no registrado', schema: { example: { code: 'USER_NOT_FOUND' } } })
@ApiResponse({ status: 409, description: 'La cuenta ya está activa', schema: { example: { code: 'USER_ALREADY_ACTIVE' } } })
@ApiResponse({ status: 429, description: 'Demasiadas solicitudes — intente más tarde' })
async resendActivation(@Body() body: ResendActivationDto): Promise<{ message: string }> {
  await this.onboardingService.resendActivation(body.email);
  return { message: 'Activation email sent' };
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/onboarding/dto/resend-activation.dto.ts \
        apps/api-core/src/onboarding/dto/index.ts \
        apps/api-core/src/onboarding/onboarding.controller.ts
git commit -m "feat(onboarding): add POST resend-activation endpoint"
```

---

### Task 6: E2E tests

**Files:**
- Create: `apps/api-core/test/onboarding/resend-activation.e2e-spec.ts`

- [ ] **Step 1: Create E2E test file**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, uniqueName } from './onboarding.helpers';

const TEST_DB = path.resolve(__dirname, 'test-onboarding-resend.db');

describe('POST /v1/onboarding/resend-activation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  async function registerUser(email: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/v1/onboarding/register')
      .field('email', email)
      .field('restaurantName', uniqueName())
      .field('timezone', 'UTC')
      .expect(201);
  }

  it('200 — reenvía email a usuario inactivo y regenera el token', async () => {
    const email = uniqueEmail('resend-ok');
    await registerUser(email);

    const userBefore = await prisma.user.findFirst({ where: { email } });
    expect(userBefore!.isActive).toBe(false);
    const tokenBefore = userBefore!.activationToken;

    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email })
      .expect(200);

    expect(res.body).toEqual({ message: 'Activation email sent' });

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).not.toBeNull();
    expect(userAfter!.activationToken).not.toBe(tokenBefore);
  });

  it('404 — email no registrado devuelve USER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email: uniqueEmail('ghost') })
      .expect(404);

    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('409 — cuenta ya activa devuelve USER_ALREADY_ACTIVE', async () => {
    const email = uniqueEmail('active');
    await registerUser(email);

    // Activate the user directly in DB
    await prisma.user.updateMany({
      where: { email },
      data: { isActive: true, activationToken: null },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email })
      .expect(409);

    expect(res.body.code).toBe('USER_ALREADY_ACTIVE');
  });

  it('429 — el 4° request con el mismo email retorna Too Many Requests', async () => {
    const email = uniqueEmail('ratelimit');
    await registerUser(email);

    // 3 allowed requests
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/v1/onboarding/resend-activation')
        .send({ email })
        .expect(200);
    }

    // 4th request must be blocked
    await request(app.getHttpServer())
      .post('/v1/onboarding/resend-activation')
      .send({ email })
      .expect(429);
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
docker compose exec res-api-core pnpm test:e2e -- --testPathPattern=resend-activation
```

Expected: 4 tests pass.

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
docker compose exec res-api-core pnpm test
docker compose exec res-api-core pnpm test:e2e
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/test/onboarding/resend-activation.e2e-spec.ts
git commit -m "test(onboarding): e2e tests for resend-activation endpoint"
```

---

### Task 7: Update module documentation

**Files:**
- Modify: `apps/api-core/src/onboarding/onboarding.module.info.md`

- [ ] **Step 1: Update the module info doc**

Add the new endpoint to the **Endpoints** table:

```markdown
| `POST` | `/v1/onboarding/resend-activation` | Público | `{ message: string }` | Reenviar email de activación |
```

Add a new section after the `Register` section:

```markdown
---

#### Resend Activation — `POST /v1/onboarding/resend-activation`

**Content-Type:** `application/json`

**Rate limit:** 3 requests por email en ventana de 15 minutos (TTL: 900 000 ms). La clave de throttle es el email del body, no la IP.

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `email` | string | ✅ | email válido |

**Flujo interno:**

1. Busca usuario por email — lanza `USER_NOT_FOUND` (404) si no existe
2. Si `isActive: true` → lanza `USER_ALREADY_ACTIVE` (409)
3. Genera nuevo `activationToken` (UUID) — invalida el token anterior
4. Persiste el nuevo token en BD
5. Envía email de activación (falla silenciosa — no bloquea la respuesta)

| Caso | Status | Code |
|---|---|---|
| Reenvío exitoso | 200 | — |
| Email no registrado | 404 | `USER_NOT_FOUND` |
| Cuenta ya activa | 409 | `USER_ALREADY_ACTIVE` |
| 4° request mismo email (15 min) | 429 | — |
```

Add the new exceptions to the **Excepciones** table:

```markdown
| `UserNotFoundException` | 404 | `USER_NOT_FOUND` |
| `UserAlreadyActiveException` | 409 | `USER_ALREADY_ACTIVE` |
```

Add new E2E test file to the **Tests existentes** table:

```markdown
| E2E — resend activation | `test/onboarding/resend-activation.e2e-spec.ts` | ✅ 4 tests |
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.module.info.md
git commit -m "docs(onboarding): update module info with resend-activation endpoint"
```
