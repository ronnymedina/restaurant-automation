import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  UseGuards,
  HttpCode,
  Res,
  Req,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import type { ConfigType } from '@nestjs/config';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { authConfig } from './auth.config';
import {
  COOKIE_NAMES,
  buildAccessCookieOptions,
  buildRefreshCookieOptions,
} from './cookies/auth-cookies';
import {
  LoginDto,
  AuthLoginResponseDto,
  ProfileResponseDto,
  LogoutResponseDto,
  RecoverDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from './dto';
import { InvalidRefreshTokenException } from './exceptions/auth.exceptions';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailThrottlerGuard } from './guards/email-throttler.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(authConfig.KEY)
    private readonly cfg: ConfigType<typeof authConfig>,
  ) {}

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
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
  }

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

    this.setAuthCookies(res, accessToken, refreshToken);

    return { timezone };
  }

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
      throw new InvalidRefreshTokenException();
    }

    const { accessToken, refreshToken, timezone } =
      await this.authService.refreshTokens(refreshCookie);

    this.setAuthCookies(res, accessToken, refreshToken);

    return { timezone };
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
  @HttpCode(200)
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
