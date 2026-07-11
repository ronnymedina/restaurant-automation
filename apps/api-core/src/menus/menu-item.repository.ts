import { Injectable } from '@nestjs/common';
import { MenuItem, Product } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type MenuItemWithProduct = MenuItem & {
  product: Pick<Product, 'id' | 'name' | 'price' | 'imageUrl' | 'active'>;
};

export interface CreateMenuItemData {
  menuId: string;
  productId: string;
  sectionName?: string;
  order?: number;
}

const productSelect = {
  id: true,
  name: true,
  price: true,
  imageUrl: true,
  active: true,
} as const;

@Injectable()
export class MenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateMenuItemData): Promise<MenuItemWithProduct> {
    return this.prisma.menuItem.create({
      data: {
        menuId: data.menuId,
        productId: data.productId,
        sectionName: data.sectionName,
        order: data.order ?? 0,
      },
      include: {
        product: { select: productSelect },
      },
    });
  }

  async createMany(items: CreateMenuItemData[]): Promise<number> {
    const result = await this.prisma.menuItem.createMany({
      data: items.map((item) => ({
        menuId: item.menuId,
        productId: item.productId,
        sectionName: item.sectionName,
        order: item.order ?? 0,
      })),
    });
    return result.count;
  }

  async findById(id: string): Promise<MenuItemWithProduct | null> {
    return this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        product: { select: productSelect },
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
  ): Promise<MenuItemWithProduct> {
    return this.prisma.menuItem.update({
      where: { id },
      data,
      include: {
        product: { select: productSelect },
      },
    });
  }

  async delete(id: string): Promise<MenuItem> {
    return this.prisma.menuItem.delete({
      where: { id },
    });
  }
}
