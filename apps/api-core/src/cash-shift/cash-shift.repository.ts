import { Injectable } from '@nestjs/common';
import { CashShift, CashShiftStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type CashShiftWithUser = Prisma.CashShiftGetPayload<{
  include: { user: { select: { id: true; email: true } } };
}>;

export type CashShiftWithUserAndCount = Prisma.CashShiftGetPayload<{
  include: {
    user: { select: { id: true; email: true } };
    _count: { select: { orders: true } };
  };
}>;

export type CashShiftWithCount = Prisma.CashShiftGetPayload<{
  include: { _count: { select: { orders: true } } };
}>;

const USER_SELECT = { id: true, email: true } as const;

@Injectable()
export class CashShiftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string, userId: string): Promise<CashShiftWithUser> {
    return this.prisma.cashShift.create({
      data: { restaurantId, userId },
      include: { user: { select: USER_SELECT } },
    });
  }

  async findOpen(restaurantId: string): Promise<CashShift | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
    });
  }

  async findById(id: string): Promise<CashShiftWithUser | null> {
    return this.prisma.cashShift.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT } },
    });
  }

  async findByRestaurantIdPaginated(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ data: CashShiftWithCount[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.cashShift.findMany({
        where: { restaurantId },
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.cashShift.count({ where: { restaurantId } }),
    ]);
    return { data, total };
  }

  async findOpenId(restaurantId: string): Promise<string | null> {
    const shift = await this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
      select: { id: true },
    });
    return shift?.id ?? null;
  }

  async findOpenWithOrderCount(restaurantId: string): Promise<CashShiftWithUserAndCount | null> {
    return this.prisma.cashShift.findFirst({
      where: { restaurantId, status: CashShiftStatus.OPEN },
      include: {
        _count: { select: { orders: true } },
        user: { select: USER_SELECT },
      },
    });
  }

  /**
   * Acquires a pessimistic row-level lock on the OPEN cash shift for a restaurant.
   *
   * Must run inside a Prisma transaction. The lock is held until the surrounding
   * transaction commits or rolls back. Concurrent writers that target the same
   * row block on this lock; when released, they re-evaluate their WHERE clause
   * against the post-commit state (Postgres EvalPlanQual under READ COMMITTED).
   *
   * This is the coordination point that prevents the write-skew race between
   * CashRegisterService.closeSession and OrdersService.createOrder. See audit
   * finding H-09 and cash-register.module.info.md for the full sequence diagram.
   *
   * Security: the query uses Prisma's tagged-template `$queryRaw`, so the
   * restaurantId value is parameterized by the driver. It is never concatenated
   * into the SQL string. Do not change this method to use `$queryRawUnsafe`.
   *
   * @param tx           - active Prisma transaction client (not the root prisma)
   * @param restaurantId - UUID of the restaurant whose OPEN shift to lock
   * @returns the locked shift id, or null when no OPEN shift exists
   */
  async lockOpenShift(
    tx: Prisma.TransactionClient,
    restaurantId: string,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "CashShift"
      WHERE "restaurantId" = ${restaurantId}
        AND status = 'OPEN'
      FOR UPDATE
    `;
    return rows[0]?.id ?? null;
  }

  /**
   * Acquires a pessimistic row-level lock on a specific cash shift by id and
   * returns its current status. Used by writers that already know which shift
   * they intend to mutate (e.g. createOrder, which receives shiftId from an
   * earlier resolver/guard).
   *
   * Must run inside a Prisma transaction. See lockOpenShift for the semantics
   * of FOR UPDATE under READ COMMITTED.
   *
   * Security: parameterized via Prisma's tagged-template `$queryRaw`. The
   * shiftId value is bound by the driver, not concatenated into SQL. Do not
   * change to `$queryRawUnsafe`.
   *
   * @param tx      - active Prisma transaction client
   * @param shiftId - UUID of the shift to lock
   * @returns the locked shift status, or null if no shift exists with that id
   */
  async lockShiftById(
    tx: Prisma.TransactionClient,
    shiftId: string,
  ): Promise<CashShiftStatus | null> {
    const rows = await tx.$queryRaw<{ status: CashShiftStatus }[]>`
      SELECT status
      FROM "CashShift"
      WHERE id = ${shiftId}
      FOR UPDATE
    `;
    return rows[0]?.status ?? null;
  }
}
