import { Injectable } from '@nestjs/common';
import { CashShift } from '@prisma/client';

import { CashShiftRepository } from './cash-register-session.repository';
import { OrderRepository } from '../orders/order.repository';
import {
  CashRegisterAlreadyOpenException,
  CashRegisterNotFoundException,
  NoOpenCashRegisterException,
} from './exceptions/cash-register.exceptions';
import { DEFAULT_PAGE_SIZE } from '../config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';

@Injectable()
export class CashRegisterService {
  constructor(
    private readonly registerSessionRepository: CashShiftRepository,
    private readonly orderRepository: OrderRepository,
  ) { }

  async openSession(restaurantId: string): Promise<CashShift> {
    const existing =
      await this.registerSessionRepository.findOpen(restaurantId);

    if (existing) throw new CashRegisterAlreadyOpenException();

    return this.registerSessionRepository.create(restaurantId);
  }

  async closeSession(restaurantId: string, closedBy?: string) {
    const session = await this.registerSessionRepository.findOpen(restaurantId);
    if (!session) throw new NoOpenCashRegisterException();

    const orders = await this.orderRepository.findBySessionId(session.id, restaurantId);

    const totalSales = orders.reduce(
      (sum, o) => sum + Number(o.totalAmount),
      0,
    );
    const totalOrders = orders.length;

    // Payment method breakdown
    const paymentBreakdown: Record<string, { count: number; total: number }> =
      {};
    for (const order of orders) {
      const method = order.paymentMethod || 'UNKNOWN';
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, total: 0 };
      }
      paymentBreakdown[method].count++;
      paymentBreakdown[method].total += Number(order.totalAmount);
    }

    const closedSession = await this.registerSessionRepository.close(
      session.id,
      { totalSales, totalOrders, closedBy },
    );

    return {
      session: closedSession,
      summary: {
        totalOrders,
        totalSales,
        paymentBreakdown,
      },
    };
  }

  async getSessionHistory(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<CashShift>> {
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

    // Top-selling products aggregated from order items
    const productMap: Record<string, { name: string; quantity: number; total: number }> = {};
    for (const order of orders) {
      if (order.status === 'CANCELLED') continue;
      for (const item of order.items) {
        const pid = item.productId;
        if (!productMap[pid]) {
          productMap[pid] = {
            name: item.product?.name ?? 'Producto',
            quantity: 0,
            total: 0,
          };
        }
        productMap[pid].quantity += item.quantity;
        productMap[pid].total += Number(item.subtotal);
      }
    }

    const topProducts = Object.entries(productMap)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

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
