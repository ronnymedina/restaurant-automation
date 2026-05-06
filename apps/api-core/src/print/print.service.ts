import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderRepository } from '../orders/order.repository';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { Receipt } from './interfaces/receipt.interface';
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

  async generateReceipt(orderId: string): Promise<Receipt> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);
    const restaurant = await this.restaurantsService.findByIdWithSettings(order.restaurantId);
    if (!restaurant) throw new EntityNotFoundException('Restaurant', order.restaurantId);
    const timezone = restaurant.settings?.timezone ?? 'UTC';
    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      restaurantName: restaurant.name,
      orderNumber: order.orderNumber,
      date: this.formatDateTime(order.createdAt, timezone),
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

  async generateBoth(orderId: string): Promise<{ receipt: Receipt; kitchenTicket: KitchenTicket }> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);
    const restaurant = await this.restaurantsService.findByIdWithSettings(order.restaurantId);
    if (!restaurant) throw new EntityNotFoundException('Restaurant', order.restaurantId);
    const timezone = restaurant.settings?.timezone ?? 'UTC';
    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    const receipt: Receipt = {
      restaurantName: restaurant.name,
      orderNumber: order.orderNumber,
      date: this.formatDateTime(order.createdAt, timezone),
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
    const kitchenTicket: KitchenTicket = {
      orderNumber: order.orderNumber,
      createdAt: this.formatDateTime(order.createdAt, timezone),
      items: orderWithItems.items.map((item) => ({
        productName: item.product?.name || 'Unknown',
        quantity: item.quantity,
        notes: item.notes || undefined,
      })),
    };
    return { receipt, kitchenTicket };
  }

  async printReceipt(orderId: string): Promise<{ success: boolean; message: string }> {
    const receipt = await this.generateReceipt(orderId);
    this.logger.log(`[PRINT STUB] Receipt for order #${receipt.orderNumber}: ${JSON.stringify(receipt)}`);
    return { success: true, message: `Receipt for order #${receipt.orderNumber} sent to printer (stub)` };
  }

  async printKitchenTicket(orderId: string): Promise<{ success: boolean; message: string }> {
    const ticket = await this.generateKitchenTicket(orderId);
    this.logger.log(`[PRINT STUB] Kitchen ticket for order #${ticket.orderNumber}: ${JSON.stringify(ticket)}`);
    return { success: true, message: `Kitchen ticket for order #${ticket.orderNumber} sent to printer (stub)` };
  }
}
