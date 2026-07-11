import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderRepository } from '../orders/order.repository';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { KitchenTicket } from './interfaces/kitchen-ticket.interface';
import { EntityNotFoundException } from '../common/exceptions';

@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  private formatDateTime(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  async generateKitchenTicket(orderId: string): Promise<KitchenTicket> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);
    const restaurant = await this.restaurantsService.findByIdWithSettings(order.restaurantId);
    const timezone = restaurant?.settings?.timezone ?? 'UTC';
    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      orderNumber: order.orderNumber,
      createdAt: this.formatDateTime(order.createdAt, timezone),
      items: orderWithItems.items.map((item) => ({
        productName: item.product?.name || 'Unknown',
        quantity: item.quantity,
        notes: item.notes || undefined,
      })),
    };
  }

  async printKitchenTicket(orderId: string): Promise<{ success: boolean; message: string }> {
    const ticket = await this.generateKitchenTicket(orderId);
    this.logger.log(`[PRINT STUB] Kitchen ticket for order #${ticket.orderNumber}: ${JSON.stringify(ticket)}`);
    return { success: true, message: `Kitchen ticket for order #${ticket.orderNumber} sent to printer (stub)` };
  }
}
