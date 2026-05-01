import { Injectable } from '@nestjs/common';
import { CashShift, CashShiftStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type CashShiftWithUser = Prisma.CashShiftGetPayload<{
  include: { user: { select: { id: true; email: true } } };
}>;

export type CashShiftWithUserAndCount = Prisma.CashShiftGetPayload<{
  include: {
    user: { select: { id: true; email: true } };
    _count: { select: { orders: true } };
  };
}>;

export type CashShiftWithCount = Prisma.CashShiftGetPayload<{
  include: { _count: { select: { orders: true } } };
}>;

const USER_SELECT = { id: true, email: true } as const;

@Injectable()
export class CashShiftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string, userId: string): Promise<CashShiftWithUser> {
    return this.prisma.cashShift.create({
      data: { restaurantId, userId },
      include: { user: { select: USER_SELECT } },
    });
  }

  async findOpen(restaurantId: string): Promise<CashShift | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
    });
  }

  async findById(id: string): Promise<CashShiftWithUser | null> {
    return this.prisma.cashShift.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT } },
    });
  }

  async close(
    id: string,
    data: { totalSales: number; totalOrders: number; closedBy?: string },
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
  ): Promise<{ data: CashShiftWithCount[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.cashShift.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.cashShift.count({ where: { restaurantId } }),
    ]);
    return { data, total };
  }

  async findOpenWithOrderCount(restaurantId: string): Promise<CashShiftWithUserAndCount | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
      include: {
        _count: { select: { orders: true } },
        user: { select: USER_SELECT },
      },
    });
  }
}
