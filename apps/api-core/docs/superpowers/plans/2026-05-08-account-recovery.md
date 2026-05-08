# Account Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `POST /v1/onboarding/resend-activation` con un único endpoint público `POST /v1/auth/recover` que cubre tanto activación (cuentas inactivas) como reset de contraseña (cuentas activas), más `PUT /v1/auth/reset-password`, y actualizar el frontend con botones de escape en el wizard y páginas de recuperación.

**Architecture:** El endpoint `recover` es siempre 200 — nunca revela si el email existe ni el estado de la cuenta. `UsersService` extrae `commonActivationOrResetAccount` como método privado compartido por `activateUser` y el nuevo `resetPassword`. `AuthService` orquesta la lógica de recover usando `UsersService` y `EmailService`.

**Tech Stack:** NestJS, Prisma, bcryptjs, @nestjs/throttler, Astro, React (TSX), Tailwind CSS

---

## File Map

### api-core (backend)

| Acción | Archivo |
|--------|---------|
| Modify | `src/users/exceptions/users.exceptions.ts` |
| Modify | `src/users/users.service.ts` |
| Modify | `src/users/users.service.spec.ts` |
| Modify | `src/email/email.service.ts` |
| Create | `src/auth/guards/email-throttler.guard.ts` |
| Create | `src/auth/dto/recover.dto.ts` |
| Create | `src/auth/dto/reset-password.dto.ts` |
| Create | `src/auth/dto/reset-password-response.dto.ts` |
| Modify | `src/auth/dto/index.ts` |
| Modify | `src/auth/auth.service.ts` |
| Modify | `src/auth/auth.service.spec.ts` |
| Modify | `src/auth/auth.controller.ts` |
| Modify | `src/auth/auth.module.ts` |
| Modify | `src/onboarding/onboarding.controller.ts` |
| Modify | `src/onboarding/onboarding.service.ts` |
| Delete | `test/onboarding/resend-activation.e2e-spec.ts` |
| Create | `test/auth/helpers.ts` |
| Create | `test/auth/recover.e2e-spec.ts` |
| Create | `test/auth/reset-password.e2e-spec.ts` |
| Modify | `src/auth/auth.module.info.md` |
| Modify | `src/onboarding/onboarding.module.info.md` |

### ui (frontend)

| Acción | Archivo |
|--------|---------|
| Modify | `src/lib/error-messages.ts` |
| Modify | `src/components/onboarding/Step3Success.tsx` |
| Modify | `src/components/onboarding/OnboardingWizard.tsx` |
| Create | `src/pages/recover.astro` |
| Create | `src/pages/reset-password.astro` |

---

## Task 1: UsersService — `InactiveAccountException` + `resetPassword` (TDD)

**Files:**
- Modify: `apps/api-core/src/users/exceptions/users.exceptions.ts`
- Modify: `apps/api-core/src/users/users.service.ts`
- Modify: `apps/api-core/src/users/users.service.spec.ts`

- [ ] **Step 1: Escribir tests fallidos para `resetPassword` y `activateUser` refactorizado**

Agregar al bloque `describe('activateUser')` y agregar nuevo bloque `describe('resetPassword')` en `src/users/users.service.spec.ts`. Los tests para `activateUser` ya existen — no los reemplaces, solo agrega el nuevo `describe('resetPassword')` al final del archivo, antes del último `}`):

```typescript
  describe('resetPassword', () => {
    it('should reset password and keep user active', async () => {
      const activeUser = mockUser({ isActive: true, activationToken: 'reset-token-uuid' });
      mockUserRepository.findByActivationToken.mockResolvedValue(activeUser);
      mockUserRepository.update.mockImplementation((id, data) =>
        Promise.resolve(
          mockUser({
            id,
            isActive: true,
            passwordHash: data.passwordHash,
            activationToken: null,
          }),
        ),
      );

      const result = await service.resetPassword('reset-token-uuid', 'NewPassword123');

      expect(mockUserRepository.findByActivationToken).toHaveBeenCalledWith('reset-token-uuid');
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        activeUser.id,
        expect.objectContaining({
          isActive: true,
          activationToken: null,
          passwordHash: expect.any(String),
        }),
      );
      expect(result.activationToken).toBeNull();
    });

    it('should hash the new password correctly', async () => {
      const activeUser = mockUser({ isActive: true, activationToken: 'reset-token-uuid' });
      mockUserRepository.findByActivationToken.mockResolvedValue(activeUser);

      let capturedHash: string | undefined;
      mockUserRepository.update.mockImplementation((_id, data) => {
        capturedHash = data.passwordHash;
        return Promise.resolve(mockUser({ isActive: true }));
      });

      await service.resetPassword('reset-token-uuid', 'NewPassword123');

      const isValid = await bcrypt.compare('NewPassword123', capturedHash!);
      expect(isValid).toBe(true);
    });

    it('should throw InvalidActivationTokenException for unknown token', async () => {
      mockUserRepository.findByActivationToken.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'Password123'),
      ).rejects.toThrow(InvalidActivationTokenException);
    });

    it('should throw InactiveAccountException if user is not active', async () => {
      const inactiveUser = mockUser({ isActive: false, activationToken: 'some-token' });
      mockUserRepository.findByActivationToken.mockResolvedValue(inactiveUser);

      await expect(
        service.resetPassword('some-token', 'Password123'),
      ).rejects.toThrow(InactiveAccountException);

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });
```

También importar `InactiveAccountException` en el bloque de imports del spec:

```typescript
import {
  EmailAlreadyExistsException,
  InvalidActivationTokenException,
  InvalidRoleException,
  LastAdminException,
  UserAlreadyActiveException,
  InactiveAccountException,
} from './exceptions/users.exceptions';
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

```bash
docker compose exec res-api-core pnpm test src/users/users.service.spec.ts
```

Expected: FAIL — `InactiveAccountException` y `resetPassword` no existen.

- [ ] **Step 3: Agregar `InactiveAccountException` a `src/users/exceptions/users.exceptions.ts`**

Agregar al final del archivo (antes del fin):

```typescript
export class InactiveAccountException extends BaseException {
  constructor() {
    super(
      'Account is not active',
      HttpStatus.BAD_REQUEST,
      'ACCOUNT_INACTIVE',
    );
  }
}
```

- [ ] **Step 4: Refactorizar `activateUser` y agregar `resetPassword` en `src/users/users.service.ts`**

Reemplazar el método `activateUser` y agregar `commonActivationOrResetAccount` y `resetPassword`:

```typescript
  async activateUser(token: string, password: string): Promise<User> {
    const user = await this.userRepository.findByActivationToken(token);

    if (!user) {
      throw new InvalidActivationTokenException();
    }

    if (user.isActive) {
      throw new UserAlreadyActiveException(user.email);
    }

    this.logger.log(`User activated: ${user.email}`);
    return this.commonActivationOrResetAccount(user.id, password);
  }

  async resetPassword(token: string, password: string): Promise<User> {
    const user = await this.userRepository.findByActivationToken(token);

    if (!user) {
      throw new InvalidActivationTokenException();
    }

    if (!user.isActive) {
      throw new InactiveAccountException();
    }

    this.logger.log(`Password reset for: ${user.email}`);
    return this.commonActivationOrResetAccount(user.id, password);
  }

  private async commonActivationOrResetAccount(userId: string, password: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, this.configService.bcryptSaltRounds);
    return this.userRepository.update(userId, {
      passwordHash,
      isActive: true,
      activationToken: null,
    });
  }
```

Agregar `InactiveAccountException` al bloque de imports existente en `users.service.ts`:

```typescript
import {
  EmailAlreadyExistsException,
  InvalidActivationTokenException,
  InvalidRoleException,
  LastAdminException,
  UserAlreadyActiveException,
  InactiveAccountException,
} from './exceptions/users.exceptions';
```

- [ ] **Step 5: Ejecutar tests para verificar que pasan**

```bash
docker compose exec res-api-core pnpm test src/users/users.service.spec.ts
```

Expected: PASS — todos los tests existentes + los nuevos.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/users/exceptions/users.exceptions.ts \
        apps/api-core/src/users/users.service.ts \
        apps/api-core/src/users/users.service.spec.ts
git commit -m "feat(users): add resetPassword + extract commonActivationOrResetAccount"
```

---

## Task 2: EmailService — `sendPasswordResetEmail`

**Files:**
- Modify: `apps/api-core/src/email/email.service.ts`

- [ ] **Step 1: Agregar método `sendPasswordResetEmail` a `EmailService`**

Agregar el método después de `sendActivationEmail` (antes de `sendReceiptEmail`):

```typescript
  async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const resetUrl = `${this.configService.frontendUrl}/reset-password?token=${token}`;

    if (!this.resend) {
      this.logger.warn(
        `[DEV] RESEND_API_KEY not set — email NOT sent. Reset URL for ${email}: ${resetUrl}`,
      );
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.configService.emailFrom,
        to: email,
        subject: 'Restablece tu contraseña',
        html: this.buildPasswordResetHtml(resetUrl),
      });

      if (error) {
        this.logger.error(`Resend API error for ${email}: ${error.message}`);
        return false;
      }

      this.logger.log(`Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
      return false;
    }
  }
```

Agregar el método privado `buildPasswordResetHtml` antes del cierre de la clase:

```typescript
  private buildPasswordResetHtml(resetUrl: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablece tu contraseña — DaikuLab</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <div style="display:none;max-height:0;overflow:hidden;">Solicitud de restablecimiento de contraseña.</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E4E4E7;">

          <tr>
            <td style="background-color:#F47C20;height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:32px 40px 24px;">
              <span style="font-size:20px;font-weight:400;color:#111111;letter-spacing:-0.3px;">Daiku<strong>Lab</strong></span>
              <span style="display:block;font-size:9px;font-weight:600;letter-spacing:2px;color:#A1A1AA;text-transform:uppercase;margin-top:2px;">Para Restaurantes</span>
            </td>
          </tr>

          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E4E4E7;"></div></td></tr>

          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111111;line-height:1.25;letter-spacing:-0.4px;">
                Restablece tu contraseña
              </h1>
              <p style="margin:0 0 10px;font-size:15px;color:#52525B;line-height:1.65;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#52525B;line-height:1.65;">
                Hacé clic en el botón para crear una nueva contraseña.
              </p>

              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:7px;background-color:#F47C20;">
                    <a href="${resetUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:7px;">
                      Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:13px;color:#A1A1AA;line-height:1.5;">
                Si no solicitaste este cambio, podés ignorar este correo.
              </p>
            </td>
          </tr>

          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E4E4E7;"></div></td></tr>

          <tr>
            <td style="padding:20px 40px;">
              <p style="margin:0;font-size:12px;color:#A1A1AA;">
                DaikuLab &nbsp;·&nbsp;
                <a href="${this.configService.frontendUrl}" style="color:#F47C20;text-decoration:none;">daikulab.com</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
  }
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/email/email.service.ts
git commit -m "feat(email): add sendPasswordResetEmail"
```

---

## Task 3: Auth — DTOs + EmailThrottlerGuard

**Files:**
- Create: `apps/api-core/src/auth/guards/email-throttler.guard.ts`
- Create: `apps/api-core/src/auth/dto/recover.dto.ts`
- Create: `apps/api-core/src/auth/dto/reset-password.dto.ts`
- Create: `apps/api-core/src/auth/dto/reset-password-response.dto.ts`
- Modify: `apps/api-core/src/auth/dto/index.ts`

- [ ] **Step 1: Crear `src/auth/guards/email-throttler.guard.ts`**

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

- [ ] **Step 2: Crear `src/auth/dto/recover.dto.ts`**

```typescript
import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecoverDto {
  @ApiProperty({ example: 'owner@restaurant.com' })
  @IsEmail()
  email: string;
}
```

- [ ] **Step 3: Crear `src/auth/dto/reset-password.dto.ts`**

```typescript
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'uuid-token-here' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewSecurePass123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
```

- [ ] **Step 4: Crear `src/auth/dto/reset-password-response.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordResponseDto {
  @ApiProperty({ example: 'owner@restaurant.com' })
  email: string;
}
```

- [ ] **Step 5: Actualizar `src/auth/dto/index.ts`**

```typescript
export { LoginDto } from './login.dto';
export { RefreshTokenDto } from './refresh-token.dto';
export { AuthTokensResponseDto } from './auth-tokens-response.dto';
export { ProfileResponseDto, RestaurantProfileDto } from './profile-response.dto';
export { LogoutResponseDto } from './logout-response.dto';
export { RecoverDto } from './recover.dto';
export { ResetPasswordDto } from './reset-password.dto';
export { ResetPasswordResponseDto } from './reset-password-response.dto';
```

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/auth/guards/email-throttler.guard.ts \
        apps/api-core/src/auth/dto/recover.dto.ts \
        apps/api-core/src/auth/dto/reset-password.dto.ts \
        apps/api-core/src/auth/dto/reset-password-response.dto.ts \
        apps/api-core/src/auth/dto/index.ts
git commit -m "feat(auth): add recover/reset-password DTOs and EmailThrottlerGuard"
```

---

## Task 4: AuthService — `recoverAccount` + `resetPassword` (TDD)

**Files:**
- Modify: `apps/api-core/src/auth/auth.service.ts`
- Modify: `apps/api-core/src/auth/auth.service.spec.ts`
- Modify: `apps/api-core/src/auth/auth.module.ts`

- [ ] **Step 1: Escribir tests fallidos en `auth.service.spec.ts`**

En `auth.service.spec.ts`, agregar `EmailService` al mock setup. Actualizar los mocks existentes:

**En la sección de mocks** (después de `mockUsersService`), agregar:

```typescript
const mockEmailService = {
  sendActivationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
};
```

Actualizar `mockUsersService` para incluir los métodos nuevos:

```typescript
const mockUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  refreshActivationToken: jest.fn().mockResolvedValue(undefined),
  resetPassword: jest.fn(),
};
```

**En el `beforeEach`**, agregar `EmailService` al módulo de test:

```typescript
import { EmailService } from '../email/email.service';
// ...
{ provide: EmailService, useValue: mockEmailService },
```

**Agregar imports** al principio del archivo:

```typescript
import { EmailService } from '../email/email.service';
```

**Agregar los nuevos `describe` blocks** al final del suite (antes del último `}`):

```typescript
  // ── recoverAccount ──────────────────────────────────────────────────────────

  describe('recoverAccount', () => {
    it('resolves silently when user is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.recoverAccount('ghost@test.com')).resolves.toBeUndefined();
      expect(mockUsersService.refreshActivationToken).not.toHaveBeenCalled();
      expect(mockEmailService.sendActivationEmail).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('generates new token and sends activation email for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false, activationToken: 'old-token' };
      mockUsersService.findByEmail.mockResolvedValue(inactiveUser);

      await service.recoverAccount(inactiveUser.email);

      expect(mockUsersService.refreshActivationToken).toHaveBeenCalledWith(
        inactiveUser.id,
        expect.any(String),
      );
      expect(mockEmailService.sendActivationEmail).toHaveBeenCalledWith(
        inactiveUser.email,
        expect.any(String),
      );
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('generates new token and sends password reset email for active user', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser); // mockUser.isActive = true

      await service.recoverAccount(mockUser.email);

      expect(mockUsersService.refreshActivationToken).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        expect.any(String),
      );
      expect(mockEmailService.sendActivationEmail).not.toHaveBeenCalled();
    });
  });

  // ── resetPassword ──────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('delegates to usersService.resetPassword and returns email', async () => {
      mockUsersService.resetPassword.mockResolvedValue({ ...mockUser, email: 'chef@restaurant.com' });

      const result = await service.resetPassword('valid-token', 'NewPassword123');

      expect(mockUsersService.resetPassword).toHaveBeenCalledWith('valid-token', 'NewPassword123');
      expect(result).toEqual({ email: 'chef@restaurant.com' });
    });

    it('propagates exceptions from usersService.resetPassword', async () => {
      const error = new Error('INVALID_ACTIVATION_TOKEN');
      mockUsersService.resetPassword.mockRejectedValue(error);

      await expect(service.resetPassword('bad-token', 'Password123')).rejects.toThrow(error);
    });
  });
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

```bash
docker compose exec res-api-core pnpm test src/auth/auth.service.spec.ts
```

Expected: FAIL — `recoverAccount` y `resetPassword` no existen en `AuthService`.

- [ ] **Step 3: Agregar `recoverAccount` y `resetPassword` a `AuthService`**

En `src/auth/auth.service.ts`:

**Agregar imports:**

```typescript
import { EmailService } from '../email/email.service';
```

**Agregar `EmailService` al constructor** (después de `RestaurantsService`):

```typescript
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly usersService: UsersService,
    private readonly restaurantsService: RestaurantsService,
    private readonly emailService: EmailService,
    @Inject(authConfig.KEY)
    private readonly configService: ConfigType<typeof authConfig>,
  ) { }
```

**Agregar los métodos** después de `revokeAllTokens`:

```typescript
  async recoverAccount(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;

    const newToken = randomUUID();
    await this.usersService.refreshActivationToken(user.id, newToken);

    if (!user.isActive) {
      try {
        await this.emailService.sendActivationEmail(user.email, newToken);
      } catch (error) {
        this.logger.error(`Failed to send activation email to ${user.email}`, error);
      }
    } else {
      try {
        await this.emailService.sendPasswordResetEmail(user.email, newToken);
      } catch (error) {
        this.logger.error(`Failed to send password reset email to ${user.email}`, error);
      }
    }
  }

  async resetPassword(token: string, password: string): Promise<{ email: string }> {
    const user = await this.usersService.resetPassword(token, password);
    return { email: user.email };
  }
```

- [ ] **Step 4: Actualizar `AuthModule` para importar `EmailModule`**

En `src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenRepository } from './refresh-token.repository';
import { UsersModule } from '../users/users.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { EmailModule } from '../email/email.module';
import { JWT_SECRET } from '../config';
import { authConfig } from './auth.config';

@Module({
  imports: [
    UsersModule,
    RestaurantsModule,
    EmailModule,
    PassportModule,
    ConfigModule.forFeature(authConfig),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokenRepository],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 5: Ejecutar tests para verificar que pasan**

```bash
docker compose exec res-api-core pnpm test src/auth/auth.service.spec.ts
```

Expected: PASS — todos los tests existentes + los nuevos.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/auth/auth.service.ts \
        apps/api-core/src/auth/auth.service.spec.ts \
        apps/api-core/src/auth/auth.module.ts
git commit -m "feat(auth): add recoverAccount and resetPassword to AuthService"
```

---

## Task 5: AuthController — endpoints `recover` y `reset-password`

**Files:**
- Modify: `apps/api-core/src/auth/auth.controller.ts`

- [ ] **Step 1: Agregar endpoints al controlador**

Reemplazar el contenido completo de `src/auth/auth.controller.ts`:

```typescript
import { Controller, Post, Put, Get, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshTokenDto,
  AuthTokensResponseDto,
  ProfileResponseDto,
  LogoutResponseDto,
  RecoverDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailThrottlerGuard } from './guards/email-throttler.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Authenticate a user and return access + refresh tokens' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful', type: AuthTokensResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error — invalid email format or password too short' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or inactive account' })
  async login(@Body() dto: LoginDto): Promise<AuthTokensResponseDto> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access + refresh token pair' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 201, description: 'Token rotation successful', type: AuthTokensResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error — refreshToken must be a string' })
  @ApiResponse({ status: 401, description: 'Refresh token is invalid or expired' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the profile of the currently authenticated user' })
  @ApiResponse({ status: 200, description: 'User profile returned', type: ProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'User or associated restaurant not found' })
  async me(@CurrentUser() user: { id: string }): Promise<ProfileResponseDto | null> {
    return this.authService.getProfile(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all refresh tokens for the currently authenticated user' })
  @ApiResponse({ status: 201, description: 'Logout successful — all refresh tokens revoked', type: LogoutResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  async logout(@CurrentUser() user: { id: string }): Promise<LogoutResponseDto> {
    await this.authService.revokeAllTokens(user.id);
    return { message: 'Logged out successfully' };
  }

  @Post('recover')
  @UseGuards(EmailThrottlerGuard)
  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  @ApiOperation({
    summary: 'Solicitar recuperación de cuenta',
    description: 'Envía email de activación (cuenta inactiva) o reset de contraseña (cuenta activa). Siempre responde 200 — no revela si el email existe.',
  })
  @ApiBody({ type: RecoverDto })
  @ApiResponse({ status: 200, description: 'Solicitud procesada', schema: { example: { message: 'Si el correo está registrado, recibirás un email en breve.' } } })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async recover(@Body() dto: RecoverDto): Promise<{ message: string }> {
    await this.authService.recoverAccount(dto.email);
    return { message: 'Si el correo está registrado, recibirás un email en breve.' };
  }

  @Put('reset-password')
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada', type: ResetPasswordResponseDto })
  @ApiResponse({ status: 400, description: 'Token inválido o cuenta inactiva', schema: { example: { code: 'INVALID_ACTIVATION_TOKEN' } } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/src/auth/auth.controller.ts
git commit -m "feat(auth): add POST /v1/auth/recover and PUT /v1/auth/reset-password"
```

---

## Task 6: Eliminar `resend-activation` de Onboarding

**Files:**
- Modify: `apps/api-core/src/onboarding/onboarding.controller.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.service.ts`
- Delete: `apps/api-core/test/onboarding/resend-activation.e2e-spec.ts`

- [ ] **Step 1: Eliminar el endpoint `resend-activation` del controlador**

En `src/onboarding/onboarding.controller.ts`, eliminar:
- El import `ResendActivationDto` del bloque de imports de DTOs
- El import `EmailThrottlerGuard`
- El método `resendActivation` completo (desde `@Public()` hasta el cierre del método)

El archivo resultante debe verse así:

```typescript
import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  FileTypeValidator,
  MaxFileSizeValidator,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { OnboardingService } from './onboarding.service';
import { OnboardingRegisterDto, OnboardingRegisterSwaggerDto } from './dto';
import { MAX_FILE_SIZE } from '../config';

export class OnboardingResponse {
  @ApiProperty({ description: 'Número de productos creados durante el onboarding', example: 5 })
  productsCreated: number;
}

@ApiTags('Onboarding')
@Controller({ version: '1', path: 'onboarding' })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo restaurante',
    description:
      'Crea un restaurante y opcionalmente extrae productos desde una foto de menú usando IA. El email de activación se envía al finalizar todo el proceso.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: OnboardingRegisterSwaggerDto })
  @ApiResponse({ status: 201, description: 'Restaurante registrado exitosamente', type: OnboardingResponse })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos o archivo rechazado' })
  @ApiResponse({ status: 409, description: 'El email o nombre de restaurante ya está registrado' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes — intente más tarde' })
  @ApiResponse({ status: 500, description: 'Error interno durante el onboarding' })
  @UseInterceptors(FileInterceptor('photo'))
  async register(
    @Body() body: OnboardingRegisterDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png)$/ }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ): Promise<OnboardingResponse> {
    const photo = file ? { buffer: file.buffer, mimeType: file.mimetype } : undefined;

    const result = await this.onboardingService.registerRestaurant({
      email: body.email,
      restaurantName: body.restaurantName,
      timezone: body.timezone,
      createDemoData: body.createDemoData,
      photo,
    });

    return { productsCreated: result.productsCreated };
  }
}
```

- [ ] **Step 2: Eliminar `resendActivation` de `OnboardingService`**

En `src/onboarding/onboarding.service.ts`, eliminar:
- El import `UserAlreadyActiveException` (si no se usa en otro lugar)
- El método `resendActivation` completo (desde `async resendActivation` hasta su cierre `}`)

Verificar que `UserAlreadyActiveException` no se use en ningún otro lugar del servicio antes de eliminarlo.

- [ ] **Step 3: Eliminar el archivo de tests**

```bash
rm apps/api-core/test/onboarding/resend-activation.e2e-spec.ts
```

- [ ] **Step 4: Ejecutar tests unitarios de onboarding para verificar que no se rompió nada**

```bash
docker compose exec res-api-core pnpm test src/onboarding/onboarding.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.controller.ts \
        apps/api-core/src/onboarding/onboarding.service.ts
git rm apps/api-core/test/onboarding/resend-activation.e2e-spec.ts
git commit -m "feat(onboarding): remove resend-activation endpoint (replaced by POST /v1/auth/recover)"
```

---

## Task 7: E2E tests — `POST /v1/auth/recover`

**Files:**
- Create: `apps/api-core/test/auth/helpers.ts`
- Create: `apps/api-core/test/auth/recover.e2e-spec.ts`

- [ ] **Step 1: Crear `test/auth/helpers.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { App } from 'supertest/types';
import { execSync } from 'child_process';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function bootstrapApp(dbPath: string): Promise<{
  moduleFixture: TestingModule;
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  process.env.DATABASE_URL = `file:${dbPath}`;

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

export const uniqueEmail = (prefix = 'owner') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;

export const uniqueName = (prefix = 'Restaurante') => {
  const letters = Array.from({ length: 8 }, () =>
    'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('');
  return `${prefix} ${letters}`;
};

export async function registerUser(
  app: INestApplication<App>,
  email: string,
): Promise<void> {
  await request(app.getHttpServer())
    .post('/v1/onboarding/register')
    .field('email', email)
    .field('restaurantName', uniqueName())
    .field('timezone', 'UTC')
    .expect(201);
}

export async function activateUser(
  app: INestApplication<App>,
  prisma: PrismaService,
  email: string,
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user?.activationToken) throw new Error(`No activation token for ${email}`);

  await request(app.getHttpServer())
    .put('/v1/users/activate')
    .send({ token: user.activationToken, password: 'Password123' })
    .expect(200);
}
```

- [ ] **Step 2: Crear `test/auth/recover.e2e-spec.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, registerUser } from './helpers';

const TEST_DB = path.resolve(__dirname, 'test-auth-recover.db');

describe('POST /v1/auth/recover (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('200 — usuario inactivo: regenera token y responde mensaje genérico', async () => {
    const email = uniqueEmail('recover-inactive');
    await registerUser(app, email);

    const userBefore = await prisma.user.findFirst({ where: { email } });
    const tokenBefore = userBefore!.activationToken;

    const res = await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    expect(res.body.message).toBe('Si el correo está registrado, recibirás un email en breve.');

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).not.toBeNull();
    expect(userAfter!.activationToken).not.toBe(tokenBefore);
  });

  it('200 — usuario activo: regenera token (para reset password) y responde mensaje genérico', async () => {
    const email = uniqueEmail('recover-active');
    await registerUser(app, email);

    // Activar directamente en DB
    await prisma.user.updateMany({
      where: { email },
      data: { isActive: true, activationToken: null },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    expect(res.body.message).toBe('Si el correo está registrado, recibirás un email en breve.');

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).not.toBeNull();
  });

  it('200 — email no registrado: responde exactamente igual (no revela nada)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email: uniqueEmail('ghost') })
      .expect(200);

    expect(res.body.message).toBe('Si el correo está registrado, recibirás un email en breve.');
  });

  it('400 — email inválido devuelve error de validación', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('429 — el 4° request con el mismo email retorna Too Many Requests', async () => {
    const email = uniqueEmail('recover-ratelimit');
    await registerUser(app, email);

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/v1/auth/recover')
        .send({ email })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(429);
  });
});
```

- [ ] **Step 3: Ejecutar los tests e2e**

```bash
docker compose exec res-api-core pnpm test:e2e test/auth/recover.e2e-spec.ts
```

Expected: PASS — todos los tests.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/test/auth/helpers.ts \
        apps/api-core/test/auth/recover.e2e-spec.ts
git commit -m "test(auth): add e2e tests for POST /v1/auth/recover"
```

---

## Task 8: E2E tests — `PUT /v1/auth/reset-password`

**Files:**
- Create: `apps/api-core/test/auth/reset-password.e2e-spec.ts`

- [ ] **Step 1: Crear `test/auth/reset-password.e2e-spec.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, uniqueEmail, registerUser, activateUser } from './helpers';

const TEST_DB = path.resolve(__dirname, 'test-auth-reset-password.db');

describe('PUT /v1/auth/reset-password (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('200 — reset exitoso: devuelve email y borra el activationToken', async () => {
    const email = uniqueEmail('reset-ok');
    await registerUser(app, email);
    await activateUser(app, prisma, email);

    // Generar token de reset via recover
    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    const userWithToken = await prisma.user.findFirst({ where: { email } });
    const resetToken = userWithToken!.activationToken!;

    const res = await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: resetToken, password: 'NewPassword456' })
      .expect(200);

    expect(res.body).toEqual({ email });

    const userAfter = await prisma.user.findFirst({ where: { email } });
    expect(userAfter!.activationToken).toBeNull();
    expect(userAfter!.isActive).toBe(true);
  });

  it('200 — puede iniciar sesión con la nueva contraseña tras el reset', async () => {
    const email = uniqueEmail('reset-login');
    await registerUser(app, email);
    await activateUser(app, prisma, email);

    await request(app.getHttpServer())
      .post('/v1/auth/recover')
      .send({ email })
      .expect(200);

    const userWithToken = await prisma.user.findFirst({ where: { email } });
    const resetToken = userWithToken!.activationToken!;

    await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: resetToken, password: 'ResetedPass789' })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'ResetedPass789' })
      .expect(201);

    expect(loginRes.body.accessToken).toBeDefined();
  });

  it('400 INVALID_ACTIVATION_TOKEN — token desconocido', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: 'nonexistent-token', password: 'Password123' })
      .expect(400);

    expect(res.body.code).toBe('INVALID_ACTIVATION_TOKEN');
  });

  it('400 ACCOUNT_INACTIVE — token de activación de usuario inactivo no sirve para reset', async () => {
    const email = uniqueEmail('reset-inactive');
    await registerUser(app, email);

    const user = await prisma.user.findFirst({ where: { email } });
    const activationToken = user!.activationToken!;

    const res = await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: activationToken, password: 'Password123' })
      .expect(400);

    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('400 — contraseña menor a 8 caracteres devuelve error de validación', async () => {
    await request(app.getHttpServer())
      .put('/v1/auth/reset-password')
      .send({ token: 'any-token', password: 'short' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Ejecutar los tests e2e**

```bash
docker compose exec res-api-core pnpm test:e2e test/auth/reset-password.e2e-spec.ts
```

Expected: PASS — todos los tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/auth/reset-password.e2e-spec.ts
git commit -m "test(auth): add e2e tests for PUT /v1/auth/reset-password"
```

---

## Task 9: Actualizar module info files

**Files:**
- Modify: `apps/api-core/src/auth/auth.module.info.md`
- Modify: `apps/api-core/src/onboarding/onboarding.module.info.md`

- [ ] **Step 1: Actualizar `auth.module.info.md`**

Agregar al bloque de Endpoints la tabla con las nuevas rutas:

```markdown
| `POST` | `/v1/auth/recover` | Público | Solicitar recuperación (activa o reset) |
| `PUT` | `/v1/auth/reset-password` | Público | Restablecer contraseña con token |
```

Agregar secciones de documentación para los nuevos endpoints (después de la sección de Logout):

```markdown
---

#### Recover — `POST /v1/auth/recover`

**Rate limit:** 3 requests por email en ventana de 15 minutos. La clave de throttle es el email del body.

| Campo | Tipo | Requerido |
|---|---|---|
| `email` | string | ✅ |

**Flujo interno:**
1. Si el email no existe — no hace nada, responde 200
2. Si `isActive: false` → genera nuevo `activationToken`, envía email de activación (link a `/activate?token=xxx`)
3. Si `isActive: true` → genera nuevo `activationToken`, envía email de reset de contraseña (link a `/reset-password?token=xxx`)
4. Siempre responde `200 { message: "Si el correo está registrado, recibirás un email en breve." }`

| Caso | Status | Code |
|---|---|---|
| Cualquier resultado | 200 | — |
| Rate limit excedido | 429 | — |

> **Seguridad:** La respuesta es siempre idéntica — no revela si el email existe ni el estado de la cuenta.

---

#### Reset Password — `PUT /v1/auth/reset-password`

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `token` | string | ✅ | — |
| `password` | string | ✅ | mínimo 8 caracteres |

**Flujo interno:**
1. Busca usuario por `activationToken` — lanza `INVALID_ACTIVATION_TOKEN` si no existe
2. Verifica `isActive: true` — lanza `ACCOUNT_INACTIVE` si la cuenta está inactiva
3. Hashea nueva contraseña, actualiza BD, borra `activationToken`
4. Responde `200 { email: string }`

| Caso | Status | Code |
|---|---|---|
| Reset exitoso | 200 | — |
| Token inválido | 400 | `INVALID_ACTIVATION_TOKEN` |
| Cuenta inactiva | 400 | `ACCOUNT_INACTIVE` |
```

Agregar excepciones nuevas a la tabla de Excepciones:

```markdown
| `InactiveAccountException` (users) | 400 | `ACCOUNT_INACTIVE` |
```

- [ ] **Step 2: Actualizar `onboarding.module.info.md`**

Eliminar la fila de `resend-activation` de la tabla de Endpoints:
```
| `POST` | `/v1/onboarding/resend-activation` | Público | `{ message: string }` | Reenviar email de activación |
```

Eliminar la sección completa `#### Resend Activation — POST /v1/onboarding/resend-activation` y su contenido.

Eliminar las excepciones relacionadas de la tabla:
- `UserNotFoundException`
- `UserAlreadyActiveException`

Eliminar la fila de tests de resend-activation de la tabla de Tests existentes:
```
| E2E — resend activation | `test/onboarding/resend-activation.e2e-spec.ts` | ✅ 4 tests |
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/auth/auth.module.info.md \
        apps/api-core/src/onboarding/onboarding.module.info.md
git commit -m "docs(auth,onboarding): update module info for account recovery"
```

---

## Task 10: Frontend — `error-messages.ts` + `Step3Success` + `OnboardingWizard`

**Files:**
- Modify: `apps/ui/src/lib/error-messages.ts`
- Modify: `apps/ui/src/components/onboarding/Step3Success.tsx`
- Modify: `apps/ui/src/components/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Agregar `INVALID_ACTIVATION_TOKEN` a `error-messages.ts`**

```typescript
const errorMessages: Record<string, string> = {
  EMAIL_ALREADY_EXISTS: 'Este correo ya está registrado',
  ONBOARDING_FAILED: 'Error en el proceso de registro. Intenta nuevamente.',
  VALIDATION_ERROR: 'Los datos ingresados no son válidos.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos',
  ACCOUNT_INACTIVE: 'Tu cuenta no está activa. Revisa tu correo para activarla.',
  INVALID_REFRESH_TOKEN: 'Tu sesión ha expirado. Inicia sesión nuevamente.',
  INVALID_ACTIVATION_TOKEN: 'El enlace no es válido o ya fue utilizado.',
};
```

- [ ] **Step 2: Actualizar `Step3Success.tsx`**

Agregar las props `onResend` y `resendStatus` al componente:

```typescript
interface Step3SuccessProps {
  email: string;
  restaurantName: string;
  productsCreated: number;
  onResend: () => void;
  resendStatus: 'idle' | 'loading' | 'sent' | 'error';
}

export default function Step3Success({
  email,
  restaurantName,
  productsCreated,
  onResend,
  resendStatus,
}: Step3SuccessProps) {
  return (
    <div className="text-center">
      <style>{`@keyframes scaleIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      <div className="text-emerald-500 mb-4" style={{ animation: 'scaleIn 0.5s ease' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h2 className="text-3xl text-slate-800 mb-2 font-bold">¡Registro Exitoso!</h2>
      <p className="text-slate-500 text-base mb-8">Tu restaurante ha sido creado</p>

      <div className="bg-green-50 rounded-xl p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-slate-500">Restaurante</span>
          <span className="text-sm font-semibold text-slate-800">{restaurantName}</span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-slate-500">Email</span>
          <span className="text-sm font-semibold text-slate-800 break-all">{email}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">Productos creados</span>
          <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
            {productsCreated} productos
          </span>
        </div>
      </div>

      <div className="flex gap-4 p-5 bg-orange-50 rounded-xl border border-orange-200 mb-6">
        <div className="text-[#f97316] flex-shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <div className="text-left">
          <strong className="text-slate-800 block mb-1">Revisa tu correo</strong>
          <p className="text-slate-500 m-0 text-sm leading-relaxed">
            Hemos enviado un enlace de activación a tu dirección de correo.
            Si no aparece en tu bandeja principal, revisa la carpeta de spam.
          </p>
        </div>
      </div>

      {resendStatus === 'sent' && (
        <p className="text-sm text-emerald-600 mb-4">
          Si el correo está registrado, recibirás un email en breve.
        </p>
      )}
      {resendStatus === 'error' && (
        <p className="text-sm text-red-500 mb-4">
          Error de conexión. Intenta nuevamente.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onResend}
          disabled={resendStatus === 'loading' || resendStatus === 'sent'}
          className="w-full py-3 px-6 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-sm font-medium cursor-pointer transition-all hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resendStatus === 'loading' ? 'Enviando...' : 'No me llegó el correo'}
        </button>
        <a
          href="/login"
          className="w-full py-3 px-6 bg-[#f97316] text-white no-underline rounded-xl text-sm font-semibold flex items-center justify-center transition-all hover:bg-orange-600"
        >
          Ir al login
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Actualizar `OnboardingWizard.tsx`**

Agregar estado `resendStatus` y handler `handleResend`. El componente completo:

```typescript
import { useState } from 'react';
import Step1Form from './Step1Form';
import Step2Upload from './Step2Upload';
import Step3Success from './Step3Success';
import { getErrorMessage } from '../../lib/error-messages';

type Step = 1 | 2 | 3;
type ResendStatus = 'idle' | 'loading' | 'sent' | 'error';

interface Step1Data {
  email: string;
  restaurantName: string;
}

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

function StepIndicator({ current }: { current: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Información' },
    { n: 2, label: 'Menú' },
    { n: 3, label: 'Confirmación' },
  ];

  return (
    <div className="flex items-center justify-center mb-10 gap-2">
      {steps.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                data-testid={`step-${s.n}`}
                data-active={String(active)}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-base transition-all duration-300 ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-[#f97316] text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : s.n}
              </div>
              <span
                className={`text-xs font-semibold ${
                  active ? 'text-[#f97316]' : 'text-slate-500'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-[3px] w-[60px] mb-6 transition-colors duration-300 rounded-full ${
                  done ? 'bg-[#f97316]' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState<Step1Data | null>(null);
  const [productsCreated, setProductsCreated] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');

  function handleStep1Submit(data: Step1Data) {
    setFormData(data);
    setError(null);
    setStep(2);
  }

  async function handleStep2Submit(photo: File | null, useDemo: boolean) {
    if (!formData) return;

    setIsLoading(true);
    setError(null);

    const body = new globalThis.FormData();
    body.append('email', formData.email);
    body.append('restaurantName', formData.restaurantName);
    body.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (useDemo) {
      body.append('createDemoData', 'true');
    } else if (photo) {
      body.append('photo', photo);
    }

    try {
      const response = await fetch(`${API_URL}/v1/onboarding/register`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg = errorData?.code
          ? getErrorMessage(errorData.code)
          : 'Hubo un error al procesar tu solicitud.';
        setError(msg);
        return;
      }

      const result = await response.json();
      setProductsCreated(result.productsCreated ?? 0);
      setStep(3);
    } catch {
      setError('Hubo un error al procesar tu solicitud. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    if (!formData) return;
    setResendStatus('loading');
    try {
      await fetch(`${API_URL}/v1/auth/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      setResendStatus('sent');
    } catch {
      setResendStatus('error');
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-md w-full max-w-[520px] p-10 relative overflow-hidden">
      <StepIndicator current={step} />

      {step === 1 && <Step1Form onSubmit={handleStep1Submit} />}
      {step === 2 && (
        <Step2Upload
          onSubmit={handleStep2Submit}
          onBack={() => setStep(1)}
          isLoading={isLoading}
          error={error}
        />
      )}
      {step === 3 && formData && (
        <Step3Success
          email={formData.email}
          restaurantName={formData.restaurantName}
          productsCreated={productsCreated}
          onResend={handleResend}
          resendStatus={resendStatus}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar tests unitarios del wizard**

```bash
cd apps/ui && pnpm test src/components/onboarding/
```

Expected: Los tests existentes pasan. Si alguno falla por las nuevas props, actualizar los mocks en los spec files con valores por defecto (`onResend: jest.fn()`, `resendStatus: 'idle'`).

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/lib/error-messages.ts \
        apps/ui/src/components/onboarding/Step3Success.tsx \
        apps/ui/src/components/onboarding/OnboardingWizard.tsx
git commit -m "feat(ui): add resend button and login link to Step3Success"
```

---

## Task 11: Frontend — `/recover.astro`

**Files:**
- Create: `apps/ui/src/pages/recover.astro`

- [ ] **Step 1: Crear `src/pages/recover.astro`**

```astro
---
export const prerender = true;
import Layout from "../layouts/Layout.astro";
---

<Layout>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#667eea] to-[#764ba2] p-8 px-4">
    <div class="bg-white/95 rounded-3xl shadow-2xl w-full max-w-[440px] p-10 relative overflow-hidden">

      <!-- Form State -->
      <div id="formState">
        <div class="text-center mb-8">
          <div class="text-indigo-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 2H3v16h5v4l4-4h5l4-4V2z"></path>
              <line x1="9" y1="9" x2="15" y2="9"></line>
              <line x1="9" y1="13" x2="13" y2="13"></line>
            </svg>
          </div>
          <h2 class="text-3xl text-slate-800 mb-2 font-bold">Recuperar cuenta</h2>
          <p class="text-slate-500 text-base m-0">Ingresa tu email y te enviaremos instrucciones</p>
        </div>

        <form id="recoverForm">
          <div class="mb-6">
            <label for="email" class="block font-semibold text-slate-800 mb-2 text-sm">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="tu@email.com"
              required
              class="w-full py-3.5 px-4 border-2 border-slate-200 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400"
            />
          </div>

          <button type="submit" id="submitBtn" class="w-full py-4 px-6 bg-indigo-500 text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-indigo-600 hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed">
            Enviar instrucciones
          </button>
        </form>

        <a href="/login" class="block text-center mt-4 text-sm text-slate-500 hover:text-indigo-500 transition-colors">
          Volver al login
        </a>
      </div>

      <!-- Success State -->
      <div id="successState" class="hidden">
        <div class="text-center py-4">
          <div class="text-emerald-500 mb-4" style="animation: scaleIn 0.5s ease;">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h2 class="text-3xl text-slate-800 mb-4 font-bold">Solicitud enviada</h2>
          <p class="text-slate-500 text-base mb-8">
            Si el correo está registrado, recibirás un email en breve.
          </p>
          <a href="/login" class="w-full py-4 px-6 bg-indigo-500 text-white no-underline border-none rounded-xl text-base font-semibold flex items-center justify-center transition-all hover:bg-indigo-600">
            Volver al login
          </a>
        </div>
      </div>

      <!-- Loading Overlay -->
      <div class="loading-overlay absolute inset-0 bg-white/95 hidden flex-col items-center justify-center gap-4 rounded-3xl z-10" id="loadingOverlay">
        <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full"></div>
        <p class="text-slate-500 font-medium">Procesando...</p>
      </div>
    </div>
  </div>
</Layout>

<style>
  .hidden { display: none; }
  .loading-overlay.visible { display: flex; }
  @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { animation: spin 1s linear infinite; }
</style>

<script>
  const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

  const formState = document.getElementById("formState") as HTMLDivElement;
  const successState = document.getElementById("successState") as HTMLDivElement;
  const recoverForm = document.getElementById("recoverForm") as HTMLFormElement;
  const loadingOverlay = document.getElementById("loadingOverlay") as HTMLDivElement;
  const submitBtn = document.getElementById("submitBtn") as HTMLButtonElement;

  recoverForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (document.getElementById("email") as HTMLInputElement).value;

    submitBtn.disabled = true;
    loadingOverlay.classList.add("visible");

    try {
      await fetch(`${API_URL}/v1/auth/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Always show success — endpoint always returns 200
      formState.classList.add("hidden");
      successState.classList.remove("hidden");
    } catch {
      // Network error — show success anyway (same UX, avoid email enumeration)
      formState.classList.add("hidden");
      successState.classList.remove("hidden");
    } finally {
      loadingOverlay.classList.remove("visible");
    }
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/pages/recover.astro
git commit -m "feat(ui): add /recover.astro page for account recovery"
```

---

## Task 12: Frontend — `/reset-password.astro`

**Files:**
- Create: `apps/ui/src/pages/reset-password.astro`

- [ ] **Step 1: Crear `src/pages/reset-password.astro`**

```astro
---
export const prerender = true;
import Layout from "../layouts/Layout.astro";
---

<Layout>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#667eea] to-[#764ba2] p-8 px-4">
    <div class="bg-white/95 rounded-3xl shadow-2xl w-full max-w-[440px] p-10 relative overflow-hidden">

      <!-- Form State -->
      <div id="formState">
        <div class="text-center mb-8">
          <div class="text-indigo-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 class="text-3xl text-slate-800 mb-2 font-bold">Restablecer contraseña</h2>
          <p class="text-slate-500 text-base m-0">Ingresa tu nueva contraseña</p>
        </div>

        <form id="resetForm">
          <div class="mb-6">
            <label for="password" class="block font-semibold text-slate-800 mb-2 text-sm">Nueva contraseña</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="Mínimo 8 caracteres"
              minlength="8"
              required
              class="w-full py-3.5 px-4 border-2 border-slate-200 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400"
            />
          </div>

          <div class="mb-6">
            <label for="confirmPassword" class="block font-semibold text-slate-800 mb-2 text-sm">Confirmar contraseña</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              placeholder="Repite tu contraseña"
              minlength="8"
              required
              class="w-full py-3.5 px-4 border-2 border-slate-200 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400"
            />
          </div>

          <button type="submit" id="submitBtn" class="w-full py-4 px-6 bg-indigo-500 text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-indigo-600 hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed">
            Restablecer contraseña
          </button>
        </form>
      </div>

      <!-- Success State -->
      <div id="successState" class="hidden">
        <div class="text-center mb-8 py-4">
          <div class="text-emerald-500 mb-4" style="animation: scaleIn 0.5s ease;">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h2 class="text-3xl text-slate-800 mb-2 font-bold">Contraseña actualizada</h2>
          <p class="text-slate-500 text-base mb-8 m-0">Tu contraseña ha sido cambiada exitosamente</p>
        </div>
        <a href="/login" class="w-full py-4 px-6 bg-indigo-500 text-white no-underline border-none rounded-xl text-base font-semibold flex items-center justify-center transition-all hover:bg-indigo-600">
          Iniciar sesión
        </a>
      </div>

      <!-- Error State (invalid/expired token) -->
      <div id="errorState" class="hidden">
        <div class="text-center mb-8">
          <div class="text-red-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" x2="9" y1="9" y2="15"></line>
              <line x1="9" x2="15" y1="9" y2="15"></line>
            </svg>
          </div>
          <h2 class="text-3xl text-slate-800 mb-2 font-bold">Enlace inválido</h2>
          <p class="text-slate-500 text-base m-0 mb-8">El enlace no es válido o ya fue utilizado.</p>
        </div>
        <a href="/recover" class="w-full py-4 px-6 bg-indigo-500 text-white no-underline border-none rounded-xl text-base font-semibold flex items-center justify-center transition-all hover:bg-indigo-600">
          Solicitar nuevo enlace
        </a>
      </div>

      <!-- Loading Overlay -->
      <div class="loading-overlay absolute inset-0 bg-white/95 hidden flex-col items-center justify-center gap-4 rounded-3xl z-10" id="loadingOverlay">
        <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full"></div>
        <p class="text-slate-500 font-medium">Actualizando contraseña...</p>
      </div>

      <!-- Inline Error -->
      <div class="inline-error absolute bottom-4 left-4 right-4 bg-red-500 text-white p-4 rounded-xl hidden items-center justify-between" id="inlineError">
        <p class="m-0 font-medium"></p>
        <button type="button" class="bg-transparent border-none text-white text-2xl cursor-pointer p-0 leading-none" id="closeError">&times;</button>
      </div>
    </div>
  </div>
</Layout>

<style>
  .hidden { display: none; }
  .loading-overlay.visible { display: flex; }
  .inline-error.visible { display: flex; }
  @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { animation: spin 1s linear infinite; }
  .inline-error { animation: slideUp 0.3s ease; }
  @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>

<script>
  const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const formState = document.getElementById("formState") as HTMLDivElement;
  const successState = document.getElementById("successState") as HTMLDivElement;
  const errorState = document.getElementById("errorState") as HTMLDivElement;
  const resetForm = document.getElementById("resetForm") as HTMLFormElement;
  const loadingOverlay = document.getElementById("loadingOverlay") as HTMLDivElement;
  const inlineError = document.getElementById("inlineError") as HTMLDivElement;
  const closeError = document.getElementById("closeError") as HTMLButtonElement;

  if (!token) {
    formState.classList.add("hidden");
    errorState.classList.remove("hidden");
  }

  function showError(message: string) {
    const errorP = inlineError.querySelector("p") as HTMLParagraphElement;
    errorP.textContent = message;
    inlineError.classList.add("visible");
    setTimeout(() => inlineError.classList.remove("visible"), 5000);
  }

  closeError.addEventListener("click", () => {
    inlineError.classList.remove("visible");
  });

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = (document.getElementById("password") as HTMLInputElement).value;
    const confirmPassword = (document.getElementById("confirmPassword") as HTMLInputElement).value;

    if (password !== confirmPassword) {
      showError("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 8) {
      showError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    loadingOverlay.classList.add("visible");

    try {
      const response = await fetch(`${API_URL}/v1/auth/reset-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        const code = result?.code;
        if (code === "INVALID_ACTIVATION_TOKEN" || code === "ACCOUNT_INACTIVE") {
          formState.classList.add("hidden");
          errorState.classList.remove("hidden");
        } else {
          showError(result?.message || "Error al restablecer la contraseña");
        }
        return;
      }

      formState.classList.add("hidden");
      successState.classList.remove("hidden");
    } catch {
      showError("Error de conexión. Intenta nuevamente.");
    } finally {
      loadingOverlay.classList.remove("visible");
    }
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/pages/reset-password.astro
git commit -m "feat(ui): add /reset-password.astro page"
```

---

## Self-Review

### Spec coverage check

| Requisito del spec | Tarea |
|---|---|
| `POST /v1/auth/recover` — público, rate limit 3/email/15min | Task 5 |
| Recover: usuario inexistente → no-op, responde 200 | Task 4 + Task 7 |
| Recover: inactivo → token nuevo + email activación | Task 4 + Task 7 |
| Recover: activo → token nuevo + email reset | Task 4 + Task 7 |
| Recover: siempre 200 mismo mensaje | Task 5 + Task 7 |
| `PUT /v1/auth/reset-password` — público | Task 5 |
| Reset: exitoso → 200 `{ email }` | Task 1 + Task 5 + Task 8 |
| Reset: token inválido → 400 INVALID_ACTIVATION_TOKEN | Task 1 + Task 8 |
| Reset: cuenta inactiva → 400 ACCOUNT_INACTIVE | Task 1 + Task 8 |
| `commonActivationOrResetAccount` privado compartido | Task 1 |
| `activateUser` refactorizado con método compartido | Task 1 |
| Eliminar `POST /v1/onboarding/resend-activation` | Task 6 |
| `sendPasswordResetEmail` en EmailService | Task 2 |
| Tests e2e recover | Task 7 |
| Tests e2e reset-password | Task 8 |
| Eliminar test resend-activation | Task 6 |
| `auth.module.info.md` actualizado | Task 9 |
| `onboarding.module.info.md` actualizado | Task 9 |
| Step3Success: botón "Ir al login" | Task 10 |
| Step3Success: botón "No me llegó el correo" | Task 10 |
| `/recover.astro` | Task 11 |
| `/reset-password.astro` (clon de activate con diferencias) | Task 12 |
| `INVALID_ACTIVATION_TOKEN` en error-messages.ts | Task 10 |
