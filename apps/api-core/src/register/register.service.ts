import { Injectable } from '@nestjs/common';
import { RegisterSession } from '@prisma/client';

import { RegisterSessionRepository } from './register-session.repository';
import { OrderRepository } from '../orders/order.repository';
import {
  RegisterAlreadyOpenException,
  RegisterNotFoundException,
  NoOpenRegisterException,
} from './exceptions/register.exceptions';

@Injectable()
export class RegisterService {
  constructor(
    private readonly registerSessionRepository: RegisterSessionRepository,
    private readonly orderRepository: OrderRepository,
  ) {}

  async openSession(restaurantId: string): Promise<RegisterSession> {
    const existing =
      await this.registerSessionRepository.findOpen(restaurantId);
    if (existing) throw new RegisterAlreadyOpenException();
    return this.registerSessionRepository.create(restaurantId);
  }

  async closeSession(restaurantId: string, closedBy?: string) {
    const session = await this.registerSessionRepository.findOpen(restaurantId);
    if (!session) throw new NoOpenRegisterException();

    const orders = await this.orderRepository.findBySessionId(session.id);

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

  async getCurrentSession(restaurantId: string) {
    const session =
      await this.registerSessionRepository.findOpenWithOrderCount(restaurantId);
    return session || null;
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.registerSessionRepository.findById(sessionId);
    if (!session) throw new RegisterNotFoundException(sessionId);

    const orders = await this.orderRepository.findBySessionId(sessionId);

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

    return {
      session,
      summary: {
        totalOrders: Number(session.totalOrders) || orders.length,
        totalSales:
          Number(session.totalSales) ||
          orders.reduce((s, o) => s + Number(o.totalAmount), 0),
        paymentBreakdown,
      },
      orders,
    };
  }
}
