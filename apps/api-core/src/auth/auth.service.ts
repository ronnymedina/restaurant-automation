import { Injectable, Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';

import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { UsersService } from '../users/users.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { EmailService } from '../email/email.service';
import { authConfig } from './auth.config';
import {
  InvalidCredentialsException,
  InactiveAccountException,
  InvalidRefreshTokenException,
} from './exceptions/auth.exceptions';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly usersService: UsersService,
    private readonly restaurantsService: RestaurantsService,
    private readonly emailService: EmailService,
    @Inject(authConfig.KEY)
    private readonly configService: ConfigType<typeof authConfig>,
  ) { }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.passwordHash) {
      this.logger.warn(`Failed login attempt for email: ${email} - User not found or password hash is missing`);
      throw new InvalidCredentialsException();
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Failed login attempt for email: ${email}`);
      throw new InvalidCredentialsException();
    }

    if (!user.isActive) {
      this.logger.warn(`Login attempt on inactive account: ${email}`);
      throw new InactiveAccountException();
    }

    const restaurant = await this.restaurantsService.findByIdWithSettings(
      user.restaurantId,
    );

    if (!restaurant) {
      this.logger.warn(
        `Login attempt for user ${email} with invalid restaurantId: ${user.restaurantId}`,
      );
      throw new InvalidCredentialsException();
    }

    const accessToken = this.generateAccessToken({
      ...user,
      restaurantId: user.restaurantId,
    });
    const refreshToken = await this.generateRefreshToken(user.id);

    this.logger.log(`User logged in: ${user.email}`);

    return { accessToken, refreshToken, timezone: restaurant.settings?.timezone ?? 'UTC' };
  }

  async refreshTokens(token: string) {
    const storedToken = await this.refreshTokenRepository.findByToken(token);

    if (!storedToken) {
      throw new InvalidRefreshTokenException();
    }

    if (storedToken.expiresAt < new Date()) {
      await this.refreshTokenRepository.deleteByToken(token);
      throw new InvalidRefreshTokenException();
    }

    // Delete the used refresh token (rotation)
    await this.refreshTokenRepository.deleteByToken(token);

    const user = await this.usersService.findById(storedToken.userId);

    if (!user) {
      throw new InvalidRefreshTokenException();
    }

    const restaurant = await this.restaurantsService.findByIdWithSettings(
      user.restaurantId,
    );
    if (!restaurant) {
      this.logger.warn(
        `Refresh token attempt for user ${user.email} with invalid restaurantId: ${user.restaurantId}`,
      );
      throw new InvalidRefreshTokenException();
    }

    const accessToken = this.generateAccessToken({
      ...user,
      restaurantId: user.restaurantId,
    });

    const refreshToken = await this.generateRefreshToken(user.id);

    return { accessToken, refreshToken, timezone: restaurant.settings?.timezone ?? 'UTC' };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;

    const restaurant = await this.restaurantsService.findById(user.restaurantId);
    if (!restaurant) {
      this.logger.warn(
        `Profile attempt for user ${user.email} with invalid restaurantId: ${user.restaurantId}`,
      );
      return null;
    };

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug }
    };
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.deleteAllByUserId(userId);
    this.logger.log(`All tokens revoked for user: ${userId}`);
  }

  async recoverAccount(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;

    const newToken = randomUUID();
    await this.usersService.refreshActivationToken(user.id, newToken);

    if (!user.isActive) {
      try {
        await this.emailService.sendActivationEmail(user.email, newToken);
      } catch (error) {
        this.logger.error(`Failed to send activation email to ${user.email}`, error);
      }
    } else {
      try {
        await this.emailService.sendPasswordResetEmail(user.email, newToken);
      } catch (error) {
        this.logger.error(`Failed to send password reset email to ${user.email}`, error);
      }
    }
  }

  async resetPassword(token: string, password: string): Promise<{ email: string }> {
    const user = await this.usersService.resetPassword(token, password);
    return { email: user.email };
  }

  private generateAccessToken(user: {
    id: string;
    email: string;
    role: string;
    restaurantId: string;
  }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    };

    return this.jwtService.sign(
      { ...payload },
      {
        secret: this.configService.jwtSecret,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        expiresIn: this.configService.jwtAccessExpiration as any,
      },
    );
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = randomUUID();

    // Parse refresh expiration to milliseconds
    const expiresIn = this.parseExpiration(
      this.configService.jwtRefreshExpiration,
    );
    const expiresAt = new Date(Date.now() + expiresIn);

    await this.refreshTokenRepository.create({
      token,
      userId,
      expiresAt,
    });

    return token;
  }

  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
