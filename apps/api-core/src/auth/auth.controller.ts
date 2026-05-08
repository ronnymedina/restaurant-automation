import { Controller, Post, Put, Get, Body, UseGuards, HttpCode } from '@nestjs/common';
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
