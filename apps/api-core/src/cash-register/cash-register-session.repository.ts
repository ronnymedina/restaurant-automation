import { Injectable } from '@nestjs/common';
import { CashShift, CashShiftStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CashCashShiftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string): Promise<CashShift> {
    return this.prisma.cashShift.create({
      data: { restaurantId },
    });
  }

  async findOpen(restaurantId: string): Promise<CashShift | null> {
    return this.prisma.cashShift.findFirst({
      where: {
        restaurantId,
        status: CashShiftStatus.OPEN,
      },
    });
  }

  async findById(id: string): Promise<CashShift | null> {
    return this.prisma.cashShift.findUnique({
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
  ): Promise<CashShift> {
    return this.prisma.cashShift.update({
      where: { id },
      data: {
        status: CashShiftStatus.CLOSED,
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
  ): Promise<{ data: CashShift[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.cashShift.findMany({
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
      this.prisma.cashShift.count({
        where: { restaurantId },
      }),
    ]);
    return { data, total };
  }

  async findOpenWithOrderCount(restaurantId: string) {
    return this.prisma.cashShift.findFirst({
      where: {
        restaurantId,
        status: CashShiftStatus.OPEN,
      },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });
  }
}
