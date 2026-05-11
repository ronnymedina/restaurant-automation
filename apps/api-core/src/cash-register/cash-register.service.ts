import { Injectable } from '@nestjs/common';
import { CashShiftStatus, OrderStatus, Prisma } from '@prisma/client';

import { CashShiftRepository, CashShiftWithUser, CashShiftWithCount } from './cash-register-session.repository';
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

    const [statusGroups, paymentGroups, orders] = await Promise.all([
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
      this.orderRepository.findBySessionId(sessionId, session.restaurantId),
    ]);

    const allStatuses: OrderStatus[] = [
      OrderStatus.CREATED,
      OrderStatus.PROCESSING,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ];

    const ordersByStatus = Object.fromEntries(
      allStatuses.map((s) => {
        const g = statusGroups.find((r) => r.status === s);
        return [s, { count: g?._count.id ?? 0, total: g?._sum.totalAmount ?? 0n }];
      }),
    ) as Record<OrderStatus, { count: number; total: bigint }>;

    const totalSales =
      (ordersByStatus[OrderStatus.CREATED].total ?? 0n) +
      (ordersByStatus[OrderStatus.PROCESSING].total ?? 0n) +
      (ordersByStatus[OrderStatus.COMPLETED].total ?? 0n);

    // counts all statuses including CANCELLED (totalSales excludes it)
    const totalOrders = statusGroups.reduce((sum, g) => sum + g._count.id, 0);

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
      summary: {
        ordersByStatus,
        totalSales,
        totalOrders,
        paymentBreakdown,
      },
      orders,
    };
  }
}
