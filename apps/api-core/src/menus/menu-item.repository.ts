import { Injectable } from '@nestjs/common';
import { MenuItem } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateMenuItemData {
  menuId: string;
  productId: string;
  price?: number;
  stock?: number;
  sectionName?: string;
  order?: number;
}

@Injectable()
export class MenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateMenuItemData): Promise<MenuItem> {
    return this.prisma.menuItem.create({
      data: {
        menuId: data.menuId,
        productId: data.productId,
        price: data.price,
        stock: data.stock,
        sectionName: data.sectionName,
        order: data.order ?? 0,
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  async createMany(items: CreateMenuItemData[]): Promise<number> {
    const result = await this.prisma.menuItem.createMany({
      data: items.map((item) => ({
        menuId: item.menuId,
        productId: item.productId,
        price: item.price,
        stock: item.stock,
        sectionName: item.sectionName,
        order: item.order ?? 0,
      })),
    });
    return result.count;
  }

  async findById(id: string): Promise<MenuItem | null> {
    return this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  async getMaxOrder(menuId: string, sectionName: string): Promise<number> {
    const result = await this.prisma.menuItem.aggregate({
      where: { menuId, sectionName },
      _max: { order: true },
    });
    return result._max.order ?? -1;
  }

  async update(
    id: string,
    data: Partial<Omit<CreateMenuItemData, 'menuId' | 'productId'>>,
  ): Promise<MenuItem> {
    return this.prisma.menuItem.update({
      where: { id },
      data,
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    });
  }

  async delete(id: string): Promise<MenuItem> {
    return this.prisma.menuItem.delete({
      where: { id },
    });
  }
}
