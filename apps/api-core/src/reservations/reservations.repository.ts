import { Injectable } from '@nestjs/common';
import { Reservation, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.SEATED,
];

@Injectable()
export class ReservationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    restaurantId: string,
    filters: { date?: string; status?: ReservationStatus; tableId?: string },
  ) {
    const where: Record<string, any> = { restaurantId };

    if (filters.status) where.status = filters.status;
    if (filters.tableId) where.tableId = filters.tableId;
    if (filters.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    }

    return this.prisma.reservation.findMany({
      where,
      include: { table: true },
      orderBy: { date: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.reservation.findUnique({
      where: { id },
      include: { table: true },
    });
  }

  async create(data: {
    guestName: string;
    guestPhone: string;
    guestEmail?: string;
    partySize: number;
    date: Date;
    duration: number;
    notes?: string;
    isPaid?: boolean;
    paymentReference?: string;
    paymentPlatform?: string;
    tableId: string;
    restaurantId: string;
  }) {
    return this.prisma.reservation.create({
      data,
      include: { table: true },
    });
  }

  async update(id: string, data: Partial<Record<string, any>>) {
    return this.prisma.reservation.update({
      where: { id },
      data,
      include: { table: true },
    });
  }

  /**
   * Returns reservations for a table whose time range overlaps with [newStart, newEnd).
   * Overlap condition: existing.date < newEnd AND (existing.date + existing.duration) > newStart
   * Excludes `excludeId` to allow editing an existing reservation.
   */
  async findOverlapping(
    tableId: string,
    newStart: Date,
    newEnd: Date,
    excludeId?: string,
  ): Promise<Reservation[]> {
    const candidates = await this.prisma.reservation.findMany({
      where: {
        tableId,
        status: { in: ACTIVE_STATUSES },
        date: { lt: newEnd },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    return candidates.filter((r) => {
      const existingEnd = new Date(r.date.getTime() + r.duration * 60_000);
      return existingEnd > newStart;
    });
  }
}
