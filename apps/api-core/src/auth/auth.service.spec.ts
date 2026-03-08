// Mock auth.config before any imports that would trigger config.ts (which throws if JWT_SECRET is missing)
jest.mock('./auth.config', () => ({
  authConfig: { KEY: 'auth' },
}));

// Mock bcryptjs so we can control compare results without needing real hashing
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';

import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { authConfig } from './auth.config';
import {
  InvalidCredentialsException,
  InactiveAccountException,
  InvalidRefreshTokenException,
} from './exceptions/auth.exceptions';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-1',
  email: 'chef@restaurant.com',
  passwordHash: '$2b$10$hashedpassword',
  role: Role.MANAGER,
  isActive: true,
  activationToken: null,
  restaurantId: 'restaurant-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRestaurant = {
  id: 'restaurant-uuid-1',
  name: 'Test Restaurant',
  slug: 'test-restaurant',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRefreshToken = {
  id: 'token-uuid-1',
  token: 'valid-refresh-token',
  userId: 'user-uuid-1',
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days from now
  createdAt: new Date(),
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
};

const mockRestaurantsService = {
  findById: jest.fn(),
};

const mockRefreshTokenRepository = {
  create: jest.fn(),
  findByToken: jest.fn(),
  deleteByToken: jest.fn(),
  deleteAllByUserId: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('signed-jwt-token'),
};

const mockAuthConfig = {
  jwtSecret: 'test-secret',
  jwtAccessExpiration: '15m',
  jwtRefreshExpiration: '7d',
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: RefreshTokenRepository, useValue: mockRefreshTokenRepository },
        { provide: authConfig.KEY, useValue: mockAuthConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('throws InvalidCredentialsException when user is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login('unknown@test.com', 'password')).rejects.toThrow(
        InvalidCredentialsException,
      );
    });

    it('throws InvalidCredentialsException when user has no passwordHash', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: null });

      await expect(service.login(mockUser.email, 'password')).rejects.toThrow(
        InvalidCredentialsException,
      );
    });

    it('throws InvalidCredentialsException when password is wrong', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(mockUser.email, 'wrong-password')).rejects.toThrow(
        InvalidCredentialsException,
      );
    });

    it('throws InactiveAccountException when account is not active', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(mockUser.email, 'password')).rejects.toThrow(
        InactiveAccountException,
      );
    });

    it('throws InvalidCredentialsException when restaurant is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRestaurantsService.findById.mockResolvedValue(null);

      await expect(service.login(mockUser.email, 'password')).rejects.toThrow(
        InvalidCredentialsException,
      );
    });

    it('returns accessToken and refreshToken on successful login', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRestaurantsService.findById.mockResolvedValue(mockRestaurant);
      mockRefreshTokenRepository.create.mockResolvedValue(mockRefreshToken);

      const result = await service.login(mockUser.email, 'correct-password');

      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        refreshToken: expect.any(String),
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id, email: mockUser.email }),
        expect.objectContaining({ secret: mockAuthConfig.jwtSecret }),
      );
    });
  });

  // ── refreshTokens ──────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('throws InvalidRefreshTokenException when token does not exist', async () => {
      mockRefreshTokenRepository.findByToken.mockResolvedValue(null);

      await expect(service.refreshTokens('nonexistent-token')).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    });

    it('throws InvalidRefreshTokenException and deletes token when expired', async () => {
      const expiredToken = { ...mockRefreshToken, expiresAt: new Date(Date.now() - 1000) };
      mockRefreshTokenRepository.findByToken.mockResolvedValue(expiredToken);

      await expect(service.refreshTokens(expiredToken.token)).rejects.toThrow(
        InvalidRefreshTokenException,
      );
      expect(mockRefreshTokenRepository.deleteByToken).toHaveBeenCalledWith(expiredToken.token);
    });

    it('throws InvalidRefreshTokenException when user is not found', async () => {
      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.refreshTokens(mockRefreshToken.token)).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    });

    it('throws InvalidRefreshTokenException when restaurant is not found', async () => {
      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);
      mockUsersService.findById.mockResolvedValue(mockUser);
      mockRestaurantsService.findById.mockResolvedValue(null);

      await expect(service.refreshTokens(mockRefreshToken.token)).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    });

    it('deletes used token and returns new pair (rotation)', async () => {
      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);
      mockUsersService.findById.mockResolvedValue(mockUser);
      mockRestaurantsService.findById.mockResolvedValue(mockRestaurant);
      mockRefreshTokenRepository.create.mockResolvedValue(mockRefreshToken);

      const result = await service.refreshTokens(mockRefreshToken.token);

      expect(mockRefreshTokenRepository.deleteByToken).toHaveBeenCalledWith(mockRefreshToken.token);
      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        refreshToken: expect.any(String),
      });
    });
  });

  // ── getProfile ─────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns null when user is not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      const result = await service.getProfile('nonexistent-id');

      expect(result).toBeNull();
    });

    it('returns null when restaurant is not found', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);
      mockRestaurantsService.findById.mockResolvedValue(null);

      const result = await service.getProfile(mockUser.id);

      expect(result).toBeNull();
    });

    it('returns user profile with restaurant on success', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);
      mockRestaurantsService.findById.mockResolvedValue(mockRestaurant);

      const result = await service.getProfile(mockUser.id);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        restaurant: {
          id: mockRestaurant.id,
          name: mockRestaurant.name,
          slug: mockRestaurant.slug,
        },
      });
    });
  });

  // ── revokeAllTokens ────────────────────────────────────────────────────────

  describe('revokeAllTokens', () => {
    it('calls deleteAllByUserId and resolves', async () => {
      mockRefreshTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);

      await expect(service.revokeAllTokens(mockUser.id)).resolves.toBeUndefined();
      expect(mockRefreshTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(mockUser.id);
    });
  });

  // ── parseExpiration (via generateRefreshToken) ─────────────────────────────

  describe('parseExpiration (via login)', () => {
    beforeEach(() => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRestaurantsService.findById.mockResolvedValue(mockRestaurant);
      mockRefreshTokenRepository.create.mockResolvedValue(mockRefreshToken);
    });

    it.each([
      ['30s', 30 * 1000],
      ['15m', 15 * 60 * 1000],
      ['2h', 2 * 60 * 60 * 1000],
      ['7d', 7 * 24 * 60 * 60 * 1000],
    ])('parses %s correctly', async (expiration, expectedMs) => {
      // Override config for this test
      (service as any).configService = { ...mockAuthConfig, jwtRefreshExpiration: expiration };

      const now = Date.now();
      await service.login(mockUser.email, 'password');

      const createCall = mockRefreshTokenRepository.create.mock.calls[0][0];
      const actualMs = createCall.expiresAt.getTime() - now;

      expect(actualMs).toBeGreaterThanOrEqual(expectedMs - 100);
      expect(actualMs).toBeLessThanOrEqual(expectedMs + 500);
    });

    it('defaults to 7 days for invalid format', async () => {
      (service as any).configService = { ...mockAuthConfig, jwtRefreshExpiration: 'invalid' };

      const now = Date.now();
      await service.login(mockUser.email, 'password');

      const createCall = mockRefreshTokenRepository.create.mock.calls[0][0];
      const actualMs = createCall.expiresAt.getTime() - now;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(actualMs).toBeGreaterThanOrEqual(sevenDaysMs - 100);
      expect(actualMs).toBeLessThanOrEqual(sevenDaysMs + 500);
    });
  });
});
