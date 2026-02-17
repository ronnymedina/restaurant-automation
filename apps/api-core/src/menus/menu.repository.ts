import { Injectable } from '@nestjs/common';
import { Menu } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateMenuData {
  name: string;
  active?: boolean;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: string;
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

  async findById(id: string): Promise<Menu | null> {
    return this.prisma.menu.findUnique({
      where: { id },
    });
  }

  async findByIdWithItems(id: string) {
    return this.prisma.menu.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
          orderBy: [{ sectionName: 'asc' }, { order: 'asc' }],
        },
      },
    });
  }

  async findByRestaurantId(restaurantId: string) {
    return this.prisma.menu.findMany({
      where: { restaurantId },
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Partial<CreateMenuData>): Promise<Menu> {
    return this.prisma.menu.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Menu> {
    return this.prisma.menu.delete({
      where: { id },
    });
  }
}
