import {
  BadRequestException, Injectable, Logger, Inject, forwardRef,
} from '@nestjs/common';
import { OrderStatus, Product, MenuItem, Prisma } from '@prisma/client';

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
  menuItem: MenuItem | null;
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

  async createOrder(restaurantId: string, registerSessionId: string, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const { orderItems, stockEntries, totalAmount } = await this.validateAndBuildItems(restaurantId, dto, tx);
      this.validateExpectedTotal(totalAmount, dto.expectedTotal);
      await this.decrementAllStock(stockEntries, tx);
      const order = await this.persistOrder({ restaurantId, registerSessionId, totalAmount, dto, orderItems }, tx);
      this.orderEventsService.emitOrderCreated(restaurantId, order);
      return order;
    });
  }

  async findByRestaurantId(restaurantId: string, status?: OrderStatus) {
    return this.orderRepository.findByRestaurantId(restaurantId, status);
  }

  async findById(id: string, restaurantId: string) {
    const order = await this.orderRepository.findById(id);
    if (!order) throw new OrderNotFoundException(id);
    if (order.restaurantId !== restaurantId) throw new ForbiddenAccessException();
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

  async markAsPaid(id: string, restaurantId: string) {
    await this.findById(id, restaurantId);
    const updatedOrder = await this.orderRepository.markAsPaid(id);
    this.orderEventsService.emitOrderUpdated(restaurantId, updatedOrder);

    if (updatedOrder.customerEmail && this.printService && this.emailService) {
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

      const menuItem = item.menuItemId
        ? await tx.menuItem.findUnique({ where: { id: item.menuItemId } })
        : null;

      const unitPrice =
        menuItem?.price !== null && menuItem?.price !== undefined
          ? Number(menuItem.price)
          : Number(product.price);

      this.validateStock(product, menuItem, item);

      orderItems.push({
        productId: item.productId,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
        notes: item.notes,
      });
      stockEntries.push({ product, menuItem, item });
    }

    const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
    return { orderItems, stockEntries, totalAmount };
  }

  private validateStock(
    product: Product,
    menuItem: MenuItem | null,
    item: CreateOrderDto['items'][number],
  ): void {
    if (product.stock !== null && product.stock < item.quantity) {
      throw new StockInsufficientException(product.name, product.stock, item.quantity);
    }
    if (menuItem && menuItem.stock !== null && menuItem.stock < item.quantity) {
      throw new StockInsufficientException(`${product.name} (menu)`, menuItem.stock, item.quantity);
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
  }

  private async persistOrder(
    params: {
      restaurantId: string;
      registerSessionId: string;
      totalAmount: number;
      dto: CreateOrderDto;
      orderItems: OrderItemEntry[];
    },
    tx: Prisma.TransactionClient,
  ) {
    const session = await tx.registerSession.update({
      where: { id: params.registerSessionId },
      data: { lastOrderNumber: { increment: 1 } },
    });

    return this.orderRepository.createWithItems(
      {
        orderNumber: session.lastOrderNumber,
        totalAmount: params.totalAmount,
        restaurantId: params.restaurantId,
        registerSessionId: params.registerSessionId,
        paymentMethod: params.dto.paymentMethod,
        customerEmail: params.dto.customerEmail,
        items: params.orderItems,
      },
      tx,
    );
  }
}
