import { Injectable } from '@nestjs/common';
import { RegisterSession, RegisterSessionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CashRegisterSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string): Promise<RegisterSession> {
    return this.prisma.registerSession.create({
      data: { restaurantId },
    });
  }

  async findOpen(restaurantId: string): Promise<RegisterSession | null> {
    return this.prisma.registerSession.findFirst({
      where: {
        restaurantId,
        status: RegisterSessionStatus.OPEN,
      },
    });
  }

  async findById(id: string): Promise<RegisterSession | null> {
    return this.prisma.registerSession.findUnique({
      where: { id },
    });
  }

  async close(
    id: string,
    data: {
      totalSales: number;
      totalOrders: number;
      closedBy?: string;
    },
  ): Promise<RegisterSession> {
    return this.prisma.registerSession.update({
      where: { id },
      data: {
        status: RegisterSessionStatus.CLOSED,
        closedAt: new Date(),
        totalSales: data.totalSales,
        totalOrders: data.totalOrders,
        closedBy: data.closedBy,
      },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: RegisterSession[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.registerSession.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: {
          _count: {
            select: { orders: true },
          },
        },
      }),
      this.prisma.registerSession.count({
        where: { restaurantId },
      }),
    ]);
    return { data, total };
  }

  async findOpenWithOrderCount(restaurantId: string) {
    return this.prisma.registerSession.findFirst({
      where: {
        restaurantId,
        status: RegisterSessionStatus.OPEN,
      },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });
  }
}
