import { Injectable } from '@nestjs/common';
import { Menu } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateMenuData {
  name: string;
  active?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek?: string | null;
  restaurantId: string;
}

@Injectable()
export class MenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateMenuData): Promise<Menu> {
    return this.prisma.menu.create({
      data: {
        name: data.name,
        active: data.active ?? true,
        startTime: data.startTime,
        endTime: data.endTime,
        daysOfWeek: data.daysOfWeek,
        restaurantId: data.restaurantId,
      },
    });
  }

  async findById(id: string, restaurantId: string): Promise<Menu | null> {
    return this.prisma.menu.findFirst({
      where: { id, restaurantId, deletedAt: null },
    });
  }

  async findByIdWithItems(id: string, restaurantId: string) {
    return this.prisma.menu.findFirst({
      where: { id, restaurantId, deletedAt: null },
      include: {
        items: {
          include: {
            product: true,
          },
          orderBy: [{ sectionName: 'asc' }, { order: 'asc' }],
        },
      },
    });
  }

  async findByRestaurantId(restaurantId: string) {
    return this.prisma.menu.findMany({
      where: { restaurantId, deletedAt: null },
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ items: Awaited<ReturnType<typeof this.findByRestaurantId>>; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.menu.findMany({
        where: { restaurantId, deletedAt: null },
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.menu.count({ where: { restaurantId, deletedAt: null } }),
    ]);
    return { items, total };
  }

  async update(id: string, data: Partial<CreateMenuData>): Promise<Menu> {
    return this.prisma.menu.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.menu.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
