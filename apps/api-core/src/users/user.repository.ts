import { Injectable } from '@nestjs/common';
import { User, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserData {
  email: string;
  passwordHash?: string;
  role?: Role;
  isActive?: boolean;
  activationToken?: string | null;
  restaurantId: string;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByActivationToken(token: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { activationToken: token, deletedAt: null },
    });
  }

  async update(id: string, data: Partial<CreateUserData>): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async findByRestaurantId(restaurantId: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { restaurantId, deletedAt: null },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: User[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { restaurantId, deletedAt: null },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where: { restaurantId, deletedAt: null },
      }),
    ]);
    return { data, total };
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
