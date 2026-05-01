import { Injectable } from '@nestjs/common';
import { CashShiftStatus, OrderStatus, Prisma } from '@prisma/client';

import { CashShiftRepository, CashShiftWithUser, CashShiftWithCount } from './cash-register-session.repository';
import { OrderRepository } from '../orders/order.repository';
import {
  CashRegisterAlreadyOpenException,
  CashRegisterNotFoundException,
  NoOpenCashRegisterException,
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

      const [agg, paymentGroups] = await Promise.all([
        tx.order.aggregate({
          where: { cashShiftId: session.id },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        tx.order.groupBy({
          by: ['paymentMethod'],
          where: { cashShiftId: session.id },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
      ]);

      const totalSales = Number(agg._sum.totalAmount ?? 0n);
      const totalOrders = agg._count.id;

      const paymentBreakdown: Record<string, { count: number; total: number }> = {};
      for (const group of paymentGroups) {
        const method = group.paymentMethod ?? 'UNKNOWN';
        paymentBreakdown[method] = {
          count: group._count.id,
          total: Number(group._sum.totalAmount ?? 0n),
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

    const orders = await this.orderRepository.findBySessionId(sessionId, session.restaurantId);

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    let completedOrders = 0;
    let cancelledOrders = 0;

    for (const order of orders) {
      const method = order.paymentMethod || 'UNKNOWN';
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, total: 0 };
      }
      paymentBreakdown[method].count++;
      paymentBreakdown[method].total += Number(order.totalAmount);

      if (order.status === 'COMPLETED') completedOrders++;
      else if (order.status === 'CANCELLED') cancelledOrders++;
    }

    // Top-selling products aggregated via DB groupBy (performant for large sessions)
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
      take: 10,
    });

    const productIds = topProductRows.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productNameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    const topProducts = topProductRows.map((r) => ({
      id: r.productId,
      name: productNameMap[r.productId] ?? 'Producto',
      quantity: r._sum.quantity ?? 0,
      total: Number(r._sum.subtotal ?? 0n),
    }));

    return {
      session,
      summary: {
        totalOrders: Number(session.totalOrders) || orders.length,
        totalSales:
          Number(session.totalSales) ||
          orders.reduce((s, o) => s + Number(o.totalAmount), 0),
        completedOrders,
        cancelledOrders,
        paymentBreakdown,
        topProducts,
      },
      orders,
    };
  }
}
