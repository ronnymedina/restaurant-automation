import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { OrderRepository } from './order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderNotFoundException,
  StockInsufficientException,
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  OrderNotPaidException,
} from './exceptions/orders.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';
import { EmailService } from '../email/email.service';
import { PrintService } from '../print/print.service';
import { EventsGateway } from '../events/events.gateway';

const STATUS_ORDER: OrderStatus[] = [
  'CREATED',
  'PROCESSING',
  'COMPLETED',
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly prisma: PrismaService,
    @Optional() private readonly eventsGateway?: EventsGateway,
    @Optional() private readonly emailService?: EmailService,
    @Optional()
    @Inject(forwardRef(() => PrintService))
    private readonly printService?: PrintService,
  ) { }

  async createOrder(
    restaurantId: string,
    registerSessionId: string,
    dto: CreateOrderDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Phase 1: validate all products, compute prices (no mutations yet)
      const orderItems: {
        productId: string;
        menuItemId?: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        notes?: string;
      }[] = [];
      const stockEntries: { product: any; menuItem: any; item: (typeof dto.items)[number] }[] = [];

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product || product.restaurantId !== restaurantId) {
          throw new StockInsufficientException(
            item.productId,
            0,
            item.quantity,
          );
        }

        // Determine unit price
        let unitPrice = Number(product.price);
        const menuItem = item.menuItemId
          ? await tx.menuItem.findUnique({ where: { id: item.menuItemId } })
          : null;

        if (menuItem && menuItem.price !== null) {
          unitPrice = Number(menuItem.price);
        }

        // Validate product stock (null = infinite, skip check)
        if (product.stock !== null && product.stock < item.quantity) {
          throw new StockInsufficientException(
            product.name,
            product.stock,
            item.quantity,
          );
        }

        // Validate menu item stock if applicable
        if (
          menuItem &&
          menuItem.stock !== null &&
          menuItem.stock < item.quantity
        ) {
          throw new StockInsufficientException(
            `${product.name} (menu)`,
            menuItem.stock,
            item.quantity,
          );
        }

        const subtotal = unitPrice * item.quantity;
        orderItems.push({
          productId: item.productId,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice,
          subtotal,
          notes: item.notes,
        });
        stockEntries.push({ product, menuItem, item });
      }

      const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

      // Validate expected total before any mutations
      if (
        dto.expectedTotal !== undefined &&
        Math.abs(totalAmount - dto.expectedTotal) > 0.01
      ) {
        throw new BadRequestException(
          'Los precios de tu pedido han cambiado. Por favor revisa el carrito e intenta de nuevo.',
        );
      }

      // Phase 2: decrement stock
      for (const { product, menuItem, item } of stockEntries) {
        if (product.stock !== null) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }

        if (menuItem && menuItem.stock !== null) {
          await tx.menuItem.update({
            where: { id: item.menuItemId },
            data: { stock: { decrement: item.quantity } },
          });
        }
      }

      // Increment order number atomically
      const session = await tx.registerSession.update({
        where: { id: registerSessionId },
        data: { lastOrderNumber: { increment: 1 } },
      });

      const order = await this.orderRepository.createWithItems(
        {
          orderNumber: session.lastOrderNumber,
          totalAmount,
          restaurantId,
          registerSessionId,
          paymentMethod: dto.paymentMethod,
          customerEmail: dto.customerEmail,
          items: orderItems,
        },
        tx,
      );

      this.eventsGateway?.emitToRestaurant(restaurantId, 'order:new', { order });

      return order;
    });
  }

  async findByRestaurantId(restaurantId: string, status?: OrderStatus) {
    return this.orderRepository.findByRestaurantId(restaurantId, status);
  }

  async findById(id: string, restaurantId: string) {
    const order = await this.orderRepository.findById(id);
    if (!order) throw new OrderNotFoundException(id);
    if (order.restaurantId !== restaurantId)
      throw new ForbiddenAccessException();
    return order;
  }

  async updateOrderStatus(
    id: string,
    restaurantId: string,
    newStatus: OrderStatus,
  ) {
    const order = await this.findById(id, restaurantId);

    if (order.status === 'CANCELLED') {
      throw new OrderAlreadyCancelledException(id);
    }

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const targetIdx = STATUS_ORDER.indexOf(newStatus);

    if (targetIdx <= currentIdx || targetIdx === -1) {
      throw new InvalidStatusTransitionException(order.status, newStatus);
    }

    if (newStatus === 'COMPLETED' && !order.isPaid) {
      throw new OrderNotPaidException(id);
    }

    const updated = await this.orderRepository.updateStatus(id, newStatus);
    this.eventsGateway?.emitToRestaurant(restaurantId, 'order:updated', { order: updated });
    return updated;
  }

  async cancelOrder(id: string, restaurantId: string, reason: string) {
    const order = await this.findById(id, restaurantId);

    if (order.status === 'CANCELLED') {
      throw new OrderAlreadyCancelledException(id);
    }

    if (order.status !== 'CREATED' && order.status !== 'PROCESSING') {
      throw new InvalidStatusTransitionException(order.status, 'CANCELLED');
    }

    const cancelled = await this.orderRepository.cancelOrder(id, reason);
    this.eventsGateway?.emitToRestaurant(restaurantId, 'order:updated', { order: cancelled });
    return cancelled;
  }

  async markAsPaid(id: string, restaurantId: string) {
    const order = await this.findById(id, restaurantId);
    const updatedOrder = await this.orderRepository.markAsPaid(id);

    this.eventsGateway?.emitToRestaurant(restaurantId, 'order:updated', { order: updatedOrder });

    if (
      updatedOrder.customerEmail &&
      this.printService &&
      this.emailService
    ) {
      try {
        const receipt = await this.printService.generateReceipt(id);
        await this.emailService.sendReceiptEmail(
          updatedOrder.customerEmail,
          receipt,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send receipt email for order ${id}`,
          error,
        );
      }
    }

    return updatedOrder;
  }
}
