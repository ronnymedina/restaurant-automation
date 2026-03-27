/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { UsersService } from './users.service';
import { UserRepository } from './user.repository';
import {
  EmailAlreadyExistsException,
  InvalidActivationTokenException,
  InvalidRoleException,
  LastAdminException,
  UserAlreadyActiveException,
} from './exceptions/users.exceptions';
import {
  EntityNotFoundException,
  ForbiddenAccessException,
} from '../common/exceptions';
import { userConfig } from './users.config';
import { DEFAULT_PAGE_SIZE } from '../config';

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
  delete: jest.fn(),
  findByRestaurantIdPaginated: jest.fn(),
  countAdmins: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: userConfig.KEY, useValue: { bcryptSaltRounds: 10 } },
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
        undefined,
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
    it('should create an active user with ADMIN role and hashed password linked to restaurant', async () => {
      mockUserRepository.create.mockImplementation((data) =>
        Promise.resolve(
          mockUser({
            role: Role.ADMIN,
            isActive: true,
            passwordHash: data.passwordHash,
            activationToken: null,
            restaurantId: 'restaurant-uuid-1',
          }),
        ),
      );

      const result = await service.createAdminUser(
        'admin@example.com',
        'SecurePass123',
        'restaurant-uuid-1',
      );

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@example.com',
          role: Role.ADMIN,
          isActive: true,
          passwordHash: expect.any(String),
          restaurantId: 'restaurant-uuid-1',
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

      await service.createAdminUser(
        'admin@example.com',
        'SecurePass123',
        'restaurant-uuid-1',
      );

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

  describe('createUser', () => {
    it('throws EmailAlreadyExistsException when email is taken', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser());

      await expect(
        service.createUser('test@example.com', 'Password123', Role.MANAGER, 'restaurant-uuid-1'),
      ).rejects.toThrow(EmailAlreadyExistsException);

      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleException when trying to create a user with ADMIN role', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.createUser('new@example.com', 'Password123', Role.ADMIN, 'restaurant-uuid-1'),
      ).rejects.toThrow(InvalidRoleException);

      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('creates user with hashed password, bound to caller restaurantId', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockImplementation((data) =>
        Promise.resolve(mockUser({ ...data, id: 'new-user-uuid' })),
      );

      const result = await service.createUser(
        'new@example.com',
        'Password123',
        Role.MANAGER,
        'restaurant-uuid-1',
      );

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          role: Role.MANAGER,
          isActive: true,
          restaurantId: 'restaurant-uuid-1',
          passwordHash: expect.any(String),
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('updateUser', () => {
    it('throws EntityNotFoundException when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateUser('nonexistent-id', 'restaurant-uuid-1', { role: Role.ADMIN }),
      ).rejects.toThrow(EntityNotFoundException);

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenAccessException when user belongs to a different restaurant', async () => {
      mockUserRepository.findById.mockResolvedValue(
        mockUser({ restaurantId: 'other-restaurant-uuid' }),
      );

      await expect(
        service.updateUser('user-uuid-1', 'restaurant-uuid-1', { role: Role.ADMIN }),
      ).rejects.toThrow(ForbiddenAccessException);

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('updates user when ownership is verified', async () => {
      const existing = mockUser({ isActive: true });
      mockUserRepository.findById.mockResolvedValue(existing);
      mockUserRepository.update.mockResolvedValue({ ...existing, role: Role.BASIC });

      const result = await service.updateUser('user-uuid-1', 'restaurant-uuid-1', {
        role: Role.BASIC,
      });

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-uuid-1', { role: Role.BASIC });
      expect(result.role).toBe(Role.BASIC);
    });

    it('throws InvalidRoleException when trying to promote a user to ADMIN role', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser());

      await expect(
        service.updateUser('user-uuid-1', 'restaurant-uuid-1', { role: Role.ADMIN }),
      ).rejects.toThrow(InvalidRoleException);

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('throws LastAdminException when demoting the last admin', async () => {
      const adminUser = mockUser({ role: Role.ADMIN });
      mockUserRepository.findById.mockResolvedValue(adminUser);
      mockUserRepository.countAdmins.mockResolvedValue(1);

      await expect(
        service.updateUser(adminUser.id, adminUser.restaurantId, { role: Role.MANAGER }),
      ).rejects.toThrow(LastAdminException);
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('allows demoting an admin when another admin exists', async () => {
      const adminUser = mockUser({ role: Role.ADMIN });
      const updatedUser = mockUser({ role: Role.MANAGER });
      mockUserRepository.findById.mockResolvedValue(adminUser);
      mockUserRepository.countAdmins.mockResolvedValue(2);
      mockUserRepository.update.mockResolvedValue(updatedUser);

      await expect(
        service.updateUser(adminUser.id, adminUser.restaurantId, { role: Role.MANAGER }),
      ).resolves.toEqual(updatedUser);
    });
  });

  describe('deleteUser', () => {
    it('throws EntityNotFoundException when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        service.deleteUser('nonexistent-id', 'restaurant-uuid-1'),
      ).rejects.toThrow(EntityNotFoundException);

      expect(mockUserRepository.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenAccessException when user belongs to a different restaurant', async () => {
      mockUserRepository.findById.mockResolvedValue(
        mockUser({ restaurantId: 'other-restaurant-uuid' }),
      );

      await expect(
        service.deleteUser('user-uuid-1', 'restaurant-uuid-1'),
      ).rejects.toThrow(ForbiddenAccessException);

      expect(mockUserRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes user when ownership is verified', async () => {
      const existing = mockUser();
      mockUserRepository.findById.mockResolvedValue(existing);
      mockUserRepository.delete.mockResolvedValue(existing);

      const result = await service.deleteUser('user-uuid-1', 'restaurant-uuid-1');

      expect(mockUserRepository.delete).toHaveBeenCalledWith('user-uuid-1');
      expect(result.id).toBe('user-uuid-1');
    });

    it('throws LastAdminException when deleting the last admin', async () => {
      const adminUser = mockUser({ role: Role.ADMIN });
      mockUserRepository.findById.mockResolvedValue(adminUser);
      mockUserRepository.countAdmins.mockResolvedValue(1);

      await expect(service.deleteUser(adminUser.id, adminUser.restaurantId))
        .rejects.toThrow(LastAdminException);
      expect(mockUserRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes an admin when another admin exists', async () => {
      const adminUser = mockUser({ role: Role.ADMIN });
      mockUserRepository.findById.mockResolvedValue(adminUser);
      mockUserRepository.countAdmins.mockResolvedValue(2);
      mockUserRepository.delete.mockResolvedValue(adminUser);

      await expect(service.deleteUser(adminUser.id, adminUser.restaurantId))
        .resolves.toEqual(adminUser);
      expect(mockUserRepository.delete).toHaveBeenCalledWith(adminUser.id);
    });
  });

  describe('findByRestaurantIdPaginated', () => {
    it('returns paginated users for the restaurant', async () => {
      const users = [mockUser(), mockUser({ id: 'user-uuid-2', email: 'other@example.com' })];
      mockUserRepository.findByRestaurantIdPaginated.mockResolvedValue({
        data: users,
        total: 2,
      });

      const result = await service.findByRestaurantIdPaginated('restaurant-uuid-1', 1, 10);

      expect(mockUserRepository.findByRestaurantIdPaginated).toHaveBeenCalledWith(
        'restaurant-uuid-1',
        0,  // skip = (page - 1) * limit = 0
        10,
      );
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('uses defaults when page and limit are not provided', async () => {
      mockUserRepository.findByRestaurantIdPaginated.mockResolvedValue({ data: [], total: 0 });

      const result = await service.findByRestaurantIdPaginated('restaurant-uuid-1');

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(DEFAULT_PAGE_SIZE);
    });
  });
});
