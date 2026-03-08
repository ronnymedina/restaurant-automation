import { Test, TestingModule } from '@nestjs/testing';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockTokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };
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

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('delegates to authService.login and returns tokens', async () => {
      mockAuthService.login.mockResolvedValue(mockTokens);

      const result = await controller.login({ email: 'chef@restaurant.com', password: 'pass1234' });

      expect(mockAuthService.login).toHaveBeenCalledWith('chef@restaurant.com', 'pass1234');
      expect(result).toEqual(mockTokens);
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshTokens and returns new tokens', async () => {
      mockAuthService.refreshTokens.mockResolvedValue(mockTokens);

      const result = await controller.refresh({ refreshToken: 'old-refresh-token' });

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('old-refresh-token');
      expect(result).toEqual(mockTokens);
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
