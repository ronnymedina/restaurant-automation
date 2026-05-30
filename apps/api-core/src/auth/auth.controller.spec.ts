import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { authConfig } from './auth.config';
import { InvalidRefreshTokenException } from './exceptions/auth.exceptions';
import { EmailThrottlerGuard } from './guards/email-throttler.guard';

const mockProfile = {
  id: 'user-uuid-1',
  email: 'chef@restaurant.com',
  role: 'MANAGER',
  restaurant: { id: 'rest-uuid-1', name: 'Test Restaurant', slug: 'test-restaurant' },
};

const mockAuthService = {
  login: jest.fn(),
  refreshTokens: jest.fn(),
  getProfile: jest.fn(),
  revokeAllTokens: jest.fn(),
};

const mockAuthConfig = {
  cookieDomain: '',
  cookieSecure: false,
  cookieAccessMaxAge: 900_000,
  cookieRefreshMaxAge: 604_800_000,
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
      ],
    })
      .overrideGuard(EmailThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    const cookieMock = jest.fn();
    const res = { cookie: cookieMock } as unknown as Response;

    beforeEach(() => {
      cookieMock.mockReset();
    });

    it('sets access_token and refresh_token cookies and returns only timezone', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'jwt-here',
        refreshToken: 'refresh-uuid',
        timezone: 'UTC',
      });

      const result = await controller.login({ email: 'e@x', password: 'pw' }, res);

      expect(mockAuthService.login).toHaveBeenCalledWith('e@x', 'pw');
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

  describe('refresh', () => {
    const cookieMock = jest.fn();
    const res = { cookie: cookieMock } as unknown as Response;

    beforeEach(() => {
      cookieMock.mockReset();
    });

    it('rotates tokens using the refresh cookie and re-sets both cookies', async () => {
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-jwt',
        refreshToken: 'new-uuid',
        timezone: 'UTC',
      });
      const req = { cookies: { refresh_token: 'old-uuid' } } as any;

      const result = await controller.refresh(req, res);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('old-uuid');
      expect(result).toEqual({ timezone: 'UTC' });
      expect(cookieMock).toHaveBeenCalledWith('access_token', 'new-jwt', expect.any(Object));
      expect(cookieMock).toHaveBeenCalledWith('refresh_token', 'new-uuid', expect.any(Object));
    });

    it('returns 401 when refresh cookie is missing', async () => {
      const req = { cookies: {} } as any;
      await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    });
  });

  describe('me', () => {
    it('delegates to authService.getProfile and returns profile', async () => {
      mockAuthService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.me({ id: 'user-uuid-1' });

      expect(mockAuthService.getProfile).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(mockProfile);
    });

    it('returns null when profile is not found', async () => {
      mockAuthService.getProfile.mockResolvedValue(null);

      const result = await controller.me({ id: 'nonexistent-id' });

      expect(mockAuthService.getProfile).toHaveBeenCalledWith('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('calls revokeAllTokens and returns success message', async () => {
      mockAuthService.revokeAllTokens.mockResolvedValue(undefined);

      const result = await controller.logout({ id: 'user-uuid-1' });

      expect(mockAuthService.revokeAllTokens).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
