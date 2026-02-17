import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';

import { CreateAdminCommand } from './create-admin.command';
import { UsersService } from '../../users/users.service';

const mockAdminUser = {
  id: 'admin-uuid-1',
  email: 'admin@test.com',
  passwordHash: 'hashed-password',
  role: Role.ADMIN,
  isActive: true,
  activationToken: null,
  restaurantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUsersService = {
  createAdminUser: jest.fn(),
};

describe('CreateAdminCommand', () => {
  let command: CreateAdminCommand;
  let exitSpy: jest.SpiedFunction<typeof process.exit>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateAdminCommand,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    command = module.get<CreateAdminCommand>(CreateAdminCommand);
    jest.clearAllMocks();

    // Mock process.exit to throw so execution stops (like real process.exit)
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as any;
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('should create an admin user with email and password', async () => {
    mockUsersService.createAdminUser.mockResolvedValue(mockAdminUser);

    await command.run([], {
      email: 'admin@test.com',
      password: 'SecurePass123',
    });

    expect(mockUsersService.createAdminUser).toHaveBeenCalledWith(
      'admin@test.com',
      'SecurePass123',
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should exit with code 1 if email is missing', async () => {
    await expect(
      command.run([], { email: '', password: 'SecurePass123' }),
    ).rejects.toThrow('process.exit(1)');

    expect(mockUsersService.createAdminUser).not.toHaveBeenCalled();
  });

  it('should exit with code 1 if password is missing', async () => {
    await expect(
      command.run([], { email: 'admin@test.com', password: '' }),
    ).rejects.toThrow('process.exit(1)');

    expect(mockUsersService.createAdminUser).not.toHaveBeenCalled();
  });

  it('should exit with code 1 if createAdminUser throws', async () => {
    mockUsersService.createAdminUser.mockRejectedValue(
      new Error('Duplicate email'),
    );

    await expect(
      command.run([], { email: 'admin@test.com', password: 'SecurePass123' }),
    ).rejects.toThrow('process.exit(1)');
  });

  it('should parse email option correctly', () => {
    expect(command.parseEmail('admin@test.com')).toBe('admin@test.com');
  });

  it('should parse password option correctly', () => {
    expect(command.parsePassword('MyPass123')).toBe('MyPass123');
  });
});
