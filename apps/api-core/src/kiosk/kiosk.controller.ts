import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { KioskService } from './kiosk.service';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { OrderRepository } from '../orders/order.repository';
import { EntityNotFoundException } from '../common/exceptions';

@Controller({ version: '1', path: 'kiosk' })
export class KioskController {
  constructor(
    private readonly kioskService: KioskService,
    private readonly orderRepository: OrderRepository,
  ) {}

  @Get(':slug/menus')
  async getMenus(@Param('slug') slug: string) {
    return this.kioskService.getAvailableMenus(slug);
  }

  @Get(':slug/menus/:menuId/items')
  async getMenuItems(
    @Param('slug') slug: string,
    @Param('menuId') menuId: string,
  ) {
    return this.kioskService.getMenuItems(slug, menuId);
  }

  @Post(':slug/orders')
  async createOrder(@Param('slug') slug: string, @Body() dto: CreateOrderDto) {
    return this.kioskService.createKioskOrder(slug, dto);
  }

  @Get(':slug/orders/:orderId')
  async getOrderStatus(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
  ) {
    await this.kioskService.resolveRestaurant(slug);
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);
    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      items: orderWithItems.items,
      createdAt: order.createdAt,
    };
  }
}
