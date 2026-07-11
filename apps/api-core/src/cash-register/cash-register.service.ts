import { Injectable } from '@nestjs/common';
import { CashShiftStatus, OrderStatus, Prisma } from '@prisma/client';

import { CashShiftRepository, CashShiftWithUser, CashShiftWithCount } from '../cash-shift/cash-shift.repository';
import {
  CashRegisterAlreadyOpenException,
  CashRegisterNotFoundException,
  NoOpenCashRegisterException,
  PendingOrdersException,
} from './exceptions/cash-register.exceptions';
import { DEFAULT_PAGE_SIZE } from '../config';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CashRegisterStatsService, ShiftSummary } from './cash-register-stats.service';

const CLOSED_SUMMARY_CACHE_MAX = 200;

@Injectable()
export class CashRegisterService {
  private readonly closedSummaryCache = new Map<string, ShiftSummary>();

  constructor(
    private readonly registerSessionRepository: CashShiftRepository,
    private readonly prisma: PrismaService,
    private readonly statsService: CashRegisterStatsService,
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

  /**
   * Cierra el turno abierto del restaurante. Aplica garantías race-safe vía
   * `lockOpenShift` (SELECT ... FOR UPDATE) y rechaza si hay órdenes
   * pendientes (CREATED/CONFIRMED/PROCESSING/SERVED).
   *
   * @param closedBy Identificador del actor que cierra. DEBE ser el id del
   * user JWT en flujos HTTP, o un identificador único de proceso en jobs
   * internos (ej. "system:reconciliation"). La columna `closedById` queda
   * garantizada non-null para auditoría financiera (audit H-10).
   */
  async closeSession(restaurantId: string, closedBy: string) {
    const closedSession = await this.prisma.$transaction(async (tx) => {
      const sessionId = await this.registerSessionRepository.lockOpenShift(tx, restaurantId);
      if (!sessionId) throw new NoOpenCashRegisterException();

      const pendingCount = await tx.order.count({
        where: {
          cashShiftId: sessionId,
          status: {
            in: [
              OrderStatus.CREATED,
              OrderStatus.CONFIRMED,
              OrderStatus.PROCESSING,
              OrderStatus.SERVED,
            ],
          },
        },
      });
      if (pendingCount > 0) throw new PendingOrdersException(pendingCount);

      const agg = await tx.order.aggregate({
        where: { cashShiftId: sessionId, status: OrderStatus.COMPLETED },
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      return tx.cashShift.update({
        where: { id: sessionId },
        data: {
          status: CashShiftStatus.CLOSED,
          closedAt: new Date(),
          closedBy,
          totalSales: agg._sum.totalAmount ?? 0n,
          totalOrders: agg._count.id,
        },
      });
    });

    const summary = await this.statsService.getSummary(restaurantId, closedSession.id);
    return { session: closedSession, summary };
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

  async getOpenSessionId(restaurantId: string): Promise<string | null> {
    return this.registerSessionRepository.findOpenId(restaurantId);
  }

  async getCurrentSession(restaurantId: string) {
    return this.registerSessionRepository.findOpenWithOrderCount(restaurantId);
  }

  async getSessionSummary(restaurantId: string, sessionId: string) {
    const session = await this.registerSessionRepository.findById(sessionId);
    if (!session || session.restaurantId !== restaurantId) {
      throw new CashRegisterNotFoundException(sessionId);
    }

    if (session.status === CashShiftStatus.CLOSED) {
      const cached = this.closedSummaryCache.get(sessionId);
      if (cached) return { session, summary: cached };

      const summary = await this.statsService.getSummary(restaurantId, sessionId);
      this.rememberSummary(sessionId, summary);
      return { session, summary };
    }

    const summary = await this.statsService.getSummary(restaurantId, sessionId);
    return { session, summary };
  }

  private rememberSummary(sessionId: string, summary: ShiftSummary): void {
    if (this.closedSummaryCache.size >= CLOSED_SUMMARY_CACHE_MAX) {
      const firstKey = this.closedSummaryCache.keys().next().value;
      if (firstKey !== undefined) this.closedSummaryCache.delete(firstKey);
    }
    this.closedSummaryCache.set(sessionId, summary);
  }
}
