import { Injectable } from '@nestjs/common';
import { User, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserData {
  email: string;
  passwordHash?: string;
  role?: Role;
  isActive?: boolean;
  activationToken?: string | null;
  restaurantId?: string;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByActivationToken(token: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { activationToken: token } });
  }

  async update(id: string, data: Partial<CreateUserData>): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async findByRestaurantId(restaurantId: string): Promise<User[]> {
    return this.prisma.user.findMany({ where: { restaurantId } });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
