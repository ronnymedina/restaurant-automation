import { Injectable } from '@nestjs/common';
import { RegisterSession, RegisterSessionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegisterSessionRepository {
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
