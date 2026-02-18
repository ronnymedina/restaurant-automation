import {
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
} from './exceptions/orders.exceptions';
import { ForbiddenAccessException } from '../common/exceptions';
import { EmailService } from '../email/email.service';
import { PrintService } from '../print/print.service';

const STATUS_ORDER: OrderStatus[] = [
  'CREATED',
  'PROCESSING',
  'PAID',
  'COMPLETED',
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
    @Optional()
    @Inject(forwardRef(() => PrintService))
    private readonly printService?: PrintService,
  ) {}

  async createOrder(
    restaurantId: string,
    registerSessionId: string,
    dto: CreateOrderDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Validate all products and compute prices
      const orderItems: {
        productId: string;
        menuItemId?: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        notes?: string;
      }[] = [];

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

        // Validate product stock
        if (product.stock < item.quantity) {
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

        // Decrement product stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });

        // Decrement menu item stock if applicable
        if (menuItem && menuItem.stock !== null) {
          await tx.menuItem.update({
            where: { id: item.menuItemId },
            data: { stock: { decrement: item.quantity } },
          });
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
      }

      const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

      // Increment order number atomically
      const session = await tx.registerSession.update({
        where: { id: registerSessionId },
        data: { lastOrderNumber: { increment: 1 } },
      });

      return this.orderRepository.createWithItems(
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

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const targetIdx = STATUS_ORDER.indexOf(newStatus);

    if (targetIdx <= currentIdx) {
      throw new InvalidStatusTransitionException(order.status, newStatus);
    }

    const updatedOrder = await this.orderRepository.updateStatus(id, newStatus);

    // Send receipt email when order is marked as PAID
    if (
      newStatus === 'PAID' &&
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
