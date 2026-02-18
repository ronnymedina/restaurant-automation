import { Inject, Injectable, Logger } from '@nestjs/common';
import { User, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

import { UserRepository } from './user.repository';
import {
  EmailAlreadyExistsException,
  InvalidActivationTokenException,
  InvalidRoleException,
  UserAlreadyActiveException,
} from './exceptions/users.exceptions';
import {
  EntityNotFoundException,
  ForbiddenAccessException,
} from '../common/exceptions';
import { userConfig } from './users.config';
import { type ConfigType } from '@nestjs/config';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly userRepository: UserRepository,
    @Inject(userConfig.KEY)
    private readonly configService: ConfigType<typeof userConfig>,
  ) {}

  async createOnboardingUser(
    email: string,
    restaurantId: string,
  ): Promise<User> {
    const activationToken = randomUUID();

    const user = await this.userRepository.create({
      email,
      role: Role.MANAGER,
      isActive: false,
      activationToken,
      restaurantId,
    });

    this.logger.log(`Onboarding user created: ${email}`);
    return user;
  }

  async createAdminUser(
    email: string,
    password: string,
    restaurantId: string,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(
      password,
      this.configService.bcryptSaltRounds,
    );

    const user = await this.userRepository.create({
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      restaurantId,
    });

    this.logger.log(`Admin user created: ${email}`);
    return user;
  }

  async activateUser(token: string, password: string): Promise<User> {
    const user = await this.userRepository.findByActivationToken(token);

    if (!user) {
      throw new InvalidActivationTokenException();
    }

    if (user.isActive) {
      throw new UserAlreadyActiveException(user.email);
    }

    const passwordHash = await bcrypt.hash(
      password,
      this.configService.bcryptSaltRounds,
    );

    const activatedUser = await this.userRepository.update(user.id, {
      passwordHash,
      isActive: true,
      activationToken: null,
    });

    this.logger.log(`User activated: ${user.email}`);
    return activatedUser;
  }

  async createUser(
    email: string,
    password: string,
    role: Role,
    restaurantId: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    if (role === Role.ADMIN) {
      throw new InvalidRoleException(role);
    }

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyExistsException(email);
    }

    const passwordHash = await bcrypt.hash(
      password,
      this.configService.bcryptSaltRounds,
    );

    const user = await this.userRepository.create({
      email,
      passwordHash,
      role,
      isActive: true,
      restaurantId,
    });

    this.logger.log(`User created by manager: ${email} with role ${role}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findByRestaurantId(restaurantId: string): Promise<User[]> {
    return this.userRepository.findByRestaurantId(restaurantId);
  }

  private async findByIdAndVerifyOwnership(
    id: string,
    restaurantId: string,
  ): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) throw new EntityNotFoundException('User', id);
    if (user.restaurantId !== restaurantId)
      throw new ForbiddenAccessException();
    return user;
  }

  async updateUser(
    id: string,
    restaurantId: string,
    data: { email?: string; role?: Role; isActive?: boolean },
  ): Promise<User> {
    await this.findByIdAndVerifyOwnership(id, restaurantId);
    if (data.role === Role.ADMIN) {
      throw new InvalidRoleException(data.role);
    }
    return this.userRepository.update(id, data);
  }

  async deleteUser(id: string, restaurantId: string): Promise<User> {
    await this.findByIdAndVerifyOwnership(id, restaurantId);
    return this.userRepository.delete(id);
  }
}
