import { Injectable, Logger } from '@nestjs/common';
import { User, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

import { UserRepository } from './user.repository';
import { BCRYPT_SALT_ROUNDS } from '../config';
import {
  InvalidActivationTokenException,
  UserAlreadyActiveException,
} from './exceptions/users.exceptions';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly userRepository: UserRepository) {}

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

  async createAdminUser(email: string, password: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = await this.userRepository.create({
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
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

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const activatedUser = await this.userRepository.update(user.id, {
      passwordHash,
      isActive: true,
      activationToken: null,
    });

    this.logger.log(`User activated: ${user.email}`);
    return activatedUser;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }
}
