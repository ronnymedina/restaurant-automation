import { Injectable } from '@nestjs/common';
import { CashShiftStatus, OrderStatus, Prisma } from '@prisma/client';

import { fromCents } from '../common/helpers/money';

import { CashShiftRepository, CashShiftWithUser, CashShiftWithCount } from '../cash-shift/cash-shift.repository';
import { OrderRepository } from '../orders/order.repository';
import {
  CashRegisterAlreadyOpenException,
  CashRegisterNotFoundException,
  NoOpenCashRegisterException,
  PendingOrdersException,
} from './exceptions/cash-register.exceptions';
import { DEFAULT_PAGE_SIZE } from '../config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CashRegisterService {
  constructor(
    private readonly registerSessionRepository: CashShiftRepository,
    private readonly orderRepository: OrderRepository,
    private readonly prisma: PrismaService,
  ) { }

  async openSession(restaurantId: string, userId: string): Promise<CashShiftWithUser> {
    const existing =
      await this.registerSessionRepository.findOpen(restaurantId);

    if (existing) throw new CashRegisterAlreadyOpenException();

    try {
      return await this.registerSessionRepository.create(restaurantId, userId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new CashRegisterAlreadyOpenException();
      }
      throw e;
    }
  }

  async closeSession(restaurantId: string, closedBy?: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.cashShift.findFirst({
        where: {
          restaurantId,
          status: CashShiftStatus.OPEN,
        },
      });
      if (!session) throw new NoOpenCashRegisterException();

      const pendingCount = await tx.order.count({
        where: {
          cashShiftId: session.id,
          status: { in: [OrderStatus.CREATED, OrderStatus.PROCESSING] },
        },
      });
      if (pendingCount > 0) throw new PendingOrdersException(pendingCount);

      const [agg, paymentGroups] = await Promise.all([
        tx.order.aggregate({
          where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        tx.order.groupBy({
          by: ['paymentMethod'],
          where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
      ]);

      const totalSales = fromCents(agg._sum.totalAmount ?? 0n);
      const totalOrders = agg._count.id;

      const paymentBreakdown: Record<string, { count: number; total: number }> = {};
      for (const group of paymentGroups) {
        const method = group.paymentMethod ?? 'UNKNOWN';
        paymentBreakdown[method] = {
          count: group._count.id,
          total: fromCents(group._sum.totalAmount ?? 0n),
        };
      }

      const closedSession = await tx.cashShift.update({
        where: { id: session.id },
        data: {
          status: CashShiftStatus.CLOSED,
          closedAt: new Date(),
          closedBy,
          totalSales: agg._sum.totalAmount ?? 0n,
          totalOrders,
        },
      });

      return {
        session: closedSession,
        summary: {
          totalOrders,
          totalSales,
          paymentBreakdown,
        },
      };
    });
  }

  async getSessionHistory(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<CashShiftWithCount>> {
    const currentPage = page || 1;
    const currentLimit = limit || DEFAULT_PAGE_SIZE;
    const skip = (currentPage - 1) * currentLimit;

    const { data, total } =
      await this.registerSessionRepository.findByRestaurantIdPaginated(
        restaurantId,
        skip,
        currentLimit,
      );

    return {
      data,
      meta: {
        total,
        page: currentPage,
        limit: currentLimit,
        totalPages: Math.ceil(total / currentLimit),
      },
    };
  }

  async getCurrentSession(restaurantId: string) {
    const session =
      await this.registerSessionRepository.findOpenWithOrderCount(restaurantId);
    return session || {};
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.registerSessionRepository.findById(sessionId);
    if (!session) throw new CashRegisterNotFoundException(sessionId);

    const [statusGroups, paymentGroups] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { cashShiftId: session.id },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where: { cashShiftId: session.id, status: OrderStatus.COMPLETED },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
    ]);

    const completedGroup = statusGroups.find((g) => g.status === OrderStatus.COMPLETED);
    const cancelledGroup = statusGroups.find((g) => g.status === OrderStatus.CANCELLED);

    const completed = {
      count: completedGroup?._count.id ?? 0,
      total: completedGroup?._sum.totalAmount ?? 0n,
    };
    const cancelled = {
      count: cancelledGroup?._count.id ?? 0,
    };

    const paymentBreakdown: Record<string, { count: number; total: bigint }> = {};
    for (const g of paymentGroups) {
      const method = g.paymentMethod ?? 'UNKNOWN';
      paymentBreakdown[method] = {
        count: g._count.id,
        total: g._sum.totalAmount ?? 0n,
      };
    }

    return {
      session,
      summary: { completed, cancelled, paymentBreakdown },
    };
  }

  async getTopProducts(sessionId: string): Promise<{ topProducts: Array<{ id: string; name: string; quantity: number; total: bigint }> }> {
    const session = await this.registerSessionRepository.findById(sessionId);
    if (!session) throw new CashRegisterNotFoundException(sessionId);

    const topProductRows = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          cashShiftId: session.id,
          status: { not: OrderStatus.CANCELLED },
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const productIds = topProductRows.map((r) => r.productId);
    // findMany returns rows in DB order, but we map over topProductRows to preserve quantity-sorted order
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productNameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    return {
      topProducts: topProductRows.map((r) => ({
        id: r.productId,
        name: productNameMap[r.productId] ?? 'Producto',
        quantity: r._sum.quantity ?? 0,
        total: r._sum.subtotal ?? 0n,
      })),
    };
  }
}
