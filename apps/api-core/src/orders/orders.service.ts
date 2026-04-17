import {
  BadRequestException, Injectable, Logger, Inject, forwardRef,
} from '@nestjs/common';
import { OrderStatus, Product, Prisma } from '@prisma/client';

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
import { OrderEventsService } from '../events/orders.events';
import { PRINT_CUSTOMER_ON_CREATE } from '../config';

const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PROCESSING,
  OrderStatus.COMPLETED,
];

type OrderItemEntry = {
  productId: string;
  menuItemId?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
};

type StockEntry = {
  product: Product;
  item: CreateOrderDto['items'][number];
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly prisma: PrismaService,
    private readonly orderEventsService: OrderEventsService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => PrintService))
    private readonly printService: PrintService,
  ) {}

  async createOrder(restaurantId: string, cashShiftId: string, dto: CreateOrderDto) {
    const order = await this.prisma.$transaction(async (tx) => {
      const { orderItems, stockEntries, totalAmount } = await this.validateAndBuildItems(restaurantId, dto, tx);
      this.validateExpectedTotal(totalAmount, dto.expectedTotal);
      await this.decrementAllStock(stockEntries, tx);
      const created = await this.persistOrder({ restaurantId, cashShiftId, totalAmount, dto, orderItems }, tx);
      return created;
    });

    this.orderEventsService.emitOrderCreated(restaurantId, order);

    // Fire-and-forget: kitchen ticket — never blocks the response
    void this.printService.printKitchenTicket(order.id).catch((err) =>
      this.logger.warn(`Kitchen print failed for order #${order.orderNumber}: ${err.message}`),
    );

    // Fire-and-forget: customer receipt on creation (opt-in via PRINT_CUSTOMER_ON_CREATE)
    if (PRINT_CUSTOMER_ON_CREATE) {
      void this.printService.printReceipt(order.id).catch((err) =>
        this.logger.warn(`Customer receipt print failed for order #${order.orderNumber}: ${err.message}`),
      );
    }

    // Generate tickets for frontend — null-safe, never blocks
    const tickets = await this.printService.generateBoth(order.id).catch(() => null);

    return {
      order,
      receipt: tickets?.receipt ?? null,
      kitchenTicket: tickets?.kitchenTicket ?? null,
    };
  }

  async findByRestaurantId(restaurantId: string, status?: OrderStatus) {
    return this.orderRepository.findByRestaurantId(restaurantId, status);
  }

  async findHistory(
    restaurantId: string,
    filters: { orderNumber?: number; status?: OrderStatus; dateFrom?: string; dateTo?: string; page: number; limit: number },
  ) {
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
    let dateTo: Date | undefined;
    if (filters.dateTo) {
      dateTo = new Date(filters.dateTo);
      dateTo.setHours(23, 59, 59, 999);
    }
    return this.orderRepository.findHistory(restaurantId, {
      orderNumber: filters.orderNumber,
      status: filters.status,
      dateFrom,
      dateTo,
      page: filters.page,
      limit: filters.limit,
    });
  }

  async findById(id: string, restaurantId: string) {
    const order = await this.orderRepository.findById(id);
    if (!order || order.restaurantId !== restaurantId) throw new OrderNotFoundException(id);
    return order;
  }

  async updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus) {
    const order = await this.findById(id, restaurantId);

    if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const targetIdx = STATUS_ORDER.indexOf(newStatus);
    if (targetIdx <= currentIdx || targetIdx === -1) {
      throw new InvalidStatusTransitionException(order.status, newStatus);
    }

    if (newStatus === OrderStatus.COMPLETED && !order.isPaid) {
      throw new OrderNotPaidException(id);
    }

    const updated = await this.orderRepository.updateStatus(id, newStatus);
    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

  async cancelOrder(id: string, restaurantId: string, reason: string) {
    const order = await this.findById(id, restaurantId);

    if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);
    if (order.status !== OrderStatus.CREATED && order.status !== OrderStatus.PROCESSING) {
      throw new InvalidStatusTransitionException(order.status, OrderStatus.CANCELLED);
    }

    const cancelled = await this.orderRepository.cancelOrder(id, reason);
    this.orderEventsService.emitOrderUpdated(restaurantId, cancelled);
    return cancelled;
  }

  async kitchenAdvanceStatus(id: string, restaurantId: string, newStatus: OrderStatus) {
    const order = await this.findById(id, restaurantId);

    if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const targetIdx = STATUS_ORDER.indexOf(newStatus);
    if (targetIdx === -1 || targetIdx !== currentIdx + 1) {
      throw new InvalidStatusTransitionException(order.status, newStatus);
    }

    // Kitchen can complete without payment check — payment is handled by the cashier
    const updated = await this.orderRepository.updateStatus(id, newStatus);
    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }

  async markAsPaid(id: string, restaurantId: string) {
    await this.findById(id, restaurantId);
    const updatedOrder = await this.orderRepository.markAsPaid(id);
    this.orderEventsService.emitOrderUpdated(restaurantId, updatedOrder);

    // Fire-and-forget: physical receipt print on payment
    void this.printService.printReceipt(id).catch((err) =>
      this.logger.warn(`Receipt print failed for order ${id}: ${err.message}`),
    );

    if (updatedOrder.customerEmail && this.emailService) {
      try {
        const receipt = await this.printService.generateReceipt(id);
        await this.emailService.sendReceiptEmail(updatedOrder.customerEmail, receipt);
      } catch (error) {
        this.logger.error(`Failed to send receipt email for order ${id}`, error);
      }
    }

    return updatedOrder;
  }

  private async validateAndBuildItems(
    restaurantId: string,
    dto: CreateOrderDto,
    tx: Prisma.TransactionClient,
  ): Promise<{ orderItems: OrderItemEntry[]; stockEntries: StockEntry[]; totalAmount: number }> {
    const orderItems: OrderItemEntry[] = [];
    const stockEntries: StockEntry[] = [];

    for (const item of dto.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.restaurantId !== restaurantId) {
        throw new StockInsufficientException(item.productId, 0, item.quantity);
      }

      const unitPrice = Number(product.price);

      this.validateStock(product, item);

      orderItems.push({
        productId: item.productId,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
        notes: item.notes,
      });
      stockEntries.push({ product, item });
    }

    const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
    return { orderItems, stockEntries, totalAmount };
  }

  private validateStock(
    product: Product,
    item: CreateOrderDto['items'][number],
  ): void {
    if (product.stock !== null && product.stock < item.quantity) {
      throw new StockInsufficientException(product.name, product.stock, item.quantity);
    }
  }

  private validateExpectedTotal(totalAmount: number, expectedTotal?: number): void {
    if (expectedTotal !== undefined && Math.abs(totalAmount - expectedTotal) > 0.01) {
      throw new BadRequestException(
        'Los precios de tu pedido han cambiado. Por favor revisa el carrito e intenta de nuevo.',
      );
    }
  }

  private async decrementAllStock(stockEntries: StockEntry[], tx: Prisma.TransactionClient): Promise<void> {
    for (const { product, item } of stockEntries) {
      if (product.stock !== null) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          // product.stock is stale (pre-transaction read); pass 0 to signal stock was depleted concurrently
          throw new StockInsufficientException(product.name, 0, item.quantity);
        }
      }
    }
  }

  private async persistOrder(
    params: {
      restaurantId: string;
      cashShiftId: string;
      totalAmount: number;
      dto: CreateOrderDto;
      orderItems: OrderItemEntry[];
    },
    tx: Prisma.TransactionClient,
  ) {
    const session = await tx.cashShift.update({
      where: { id: params.cashShiftId },
      data: { lastOrderNumber: { increment: 1 } },
    });

    return this.orderRepository.createWithItems(
      {
        orderNumber: session.lastOrderNumber,
        totalAmount: params.totalAmount,
        restaurantId: params.restaurantId,
        cashShiftId: params.cashShiftId,
        paymentMethod: params.dto.paymentMethod,
        customerEmail: params.dto.customerEmail,
        items: params.orderItems,
      },
      tx,
    );
  }
}
