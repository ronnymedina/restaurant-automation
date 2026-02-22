import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { OrderRepository } from '../orders/order.repository';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { Receipt } from './interfaces/receipt.interface';
import { EntityNotFoundException } from '../common/exceptions';

@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async generateReceipt(orderId: string): Promise<Receipt> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);

    const restaurant = await this.restaurantsService.findById(
      order.restaurantId,
    );
    if (!restaurant)
      throw new EntityNotFoundException('Restaurant', order.restaurantId);

    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      restaurantName: restaurant.name,
      orderNumber: order.orderNumber,
      date: order.createdAt.toISOString(),
      items: orderWithItems.items.map((item) => ({
        productName: item.product?.name || 'Unknown',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        notes: item.notes || undefined,
      })),
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod || 'UNKNOWN',
      customerEmail: order.customerEmail || undefined,
    };
  }

  async printReceipt(
    orderId: string,
  ): Promise<{ success: boolean; message: string }> {
    const receipt = await this.generateReceipt(orderId);
    this.logger.log(
      `[PRINT STUB] Receipt for order #${receipt.orderNumber}: ${JSON.stringify(receipt)}`,
    );
    return {
      success: true,
      message: `Receipt for order #${receipt.orderNumber} sent to printer (stub)`,
    };
  }
}
