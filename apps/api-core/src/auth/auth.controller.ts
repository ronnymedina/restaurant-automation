import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ProfileResponse {
  id: string;
  email: string;
  role: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface LogoutResponse {
  message: string;
}

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthTokensResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }): Promise<ProfileResponse | null> {
    return this.authService.getProfile(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: { id: string }): Promise<LogoutResponse> {
    await this.authService.revokeAllTokens(user.id);
    return { message: 'Logged out successfully' };
  }
}
