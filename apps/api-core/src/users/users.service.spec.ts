import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { UsersService } from './users.service';
import { UserRepository } from './user.repository';
import {
  InvalidActivationTokenException,
  UserAlreadyActiveException,
} from './exceptions/users.exceptions';

const mockUser = (overrides = {}) => ({
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: null,
  role: Role.MANAGER,
  isActive: false,
  activationToken: 'activation-token-uuid',
  restaurantId: 'restaurant-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockUserRepository = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  findByActivationToken: jest.fn(),
  update: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('createOnboardingUser', () => {
    it('should create an inactive user with MANAGER role linked to restaurant', async () => {
      const user = mockUser();
      mockUserRepository.create.mockResolvedValue(user);

      const result = await service.createOnboardingUser(
        'test@example.com',
        'restaurant-uuid-1',
      );

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          role: Role.MANAGER,
          isActive: false,
          restaurantId: 'restaurant-uuid-1',
          activationToken: expect.any(String),
        }),
      );
      expect(result.email).toBe('test@example.com');
      expect(result.isActive).toBe(false);
    });

    it('should generate a unique activation token', async () => {
      mockUserRepository.create.mockImplementation((data) =>
        Promise.resolve(mockUser({ activationToken: data.activationToken })),
      );

      const result = await service.createOnboardingUser(
        'test@example.com',
        'restaurant-uuid-1',
      );

      expect(result.activationToken).toBeDefined();
      expect(result.activationToken).not.toBeNull();
    });
  });

  describe('createAdminUser', () => {
    it('should create an active user with ADMIN role and hashed password', async () => {
      mockUserRepository.create.mockImplementation((data) =>
        Promise.resolve(
          mockUser({
            role: Role.ADMIN,
            isActive: true,
            passwordHash: data.passwordHash,
            activationToken: null,
            restaurantId: null,
          }),
        ),
      );

      const result = await service.createAdminUser(
        'admin@example.com',
        'SecurePass123',
      );

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@example.com',
          role: Role.ADMIN,
          isActive: true,
          passwordHash: expect.any(String),
        }),
      );
      expect(result.isActive).toBe(true);
      expect(result.role).toBe(Role.ADMIN);
    });

    it('should hash the password before storing', async () => {
      let capturedHash: string | undefined;
      mockUserRepository.create.mockImplementation((data) => {
        capturedHash = data.passwordHash;
        return Promise.resolve(mockUser({ passwordHash: data.passwordHash }));
      });

      await service.createAdminUser('admin@example.com', 'SecurePass123');

      expect(capturedHash).toBeDefined();
      const isValid = await bcrypt.compare('SecurePass123', capturedHash!);
      expect(isValid).toBe(true);
    });
  });

  describe('activateUser', () => {
    it('should activate user, set password hash, and clear activation token', async () => {
      const inactiveUser = mockUser();
      mockUserRepository.findByActivationToken.mockResolvedValue(inactiveUser);
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

      const result = await service.activateUser(
        'activation-token-uuid',
        'NewPassword123',
      );

      expect(mockUserRepository.findByActivationToken).toHaveBeenCalledWith(
        'activation-token-uuid',
      );
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        inactiveUser.id,
        expect.objectContaining({
          isActive: true,
          activationToken: null,
          passwordHash: expect.any(String),
        }),
      );
      expect(result.isActive).toBe(true);
      expect(result.activationToken).toBeNull();
    });

    it('should hash the new password correctly', async () => {
      const inactiveUser = mockUser();
      mockUserRepository.findByActivationToken.mockResolvedValue(inactiveUser);

      let capturedHash: string | undefined;
      mockUserRepository.update.mockImplementation((_id, data) => {
        capturedHash = data.passwordHash;
        return Promise.resolve(mockUser({ isActive: true }));
      });

      await service.activateUser('activation-token-uuid', 'NewPassword123');

      const isValid = await bcrypt.compare('NewPassword123', capturedHash!);
      expect(isValid).toBe(true);
    });

    it('should throw InvalidActivationTokenException for unknown token', async () => {
      mockUserRepository.findByActivationToken.mockResolvedValue(null);

      await expect(
        service.activateUser('bad-token', 'Password123'),
      ).rejects.toThrow(InvalidActivationTokenException);
    });

    it('should throw UserAlreadyActiveException if user is already active', async () => {
      const activeUser = mockUser({ isActive: true });
      mockUserRepository.findByActivationToken.mockResolvedValue(activeUser);

      await expect(
        service.activateUser('activation-token-uuid', 'Password123'),
      ).rejects.toThrow(UserAlreadyActiveException);

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('should return user if found', async () => {
      const user = mockUser();
      mockUserRepository.findByEmail.mockResolvedValue(user);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(user);
    });

    it('should return null if not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await service.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });
});
