import { Injectable } from '@nestjs/common';
import { Reservation, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TIMEZONE } from '../config';

/**
 * Returns the UTC [start, end] range for a full calendar day in the given IANA timezone.
 * Does NOT rely on the process TZ env var — uses Intl.DateTimeFormat for explicit conversion.
 */
function localDayUtcRange(
  dateStr: string,
  timezone: string,
): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Probe at noon UTC — guaranteed to land on the same calendar day for UTC-11..+11
  const probeUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(probeUtc);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0');

  const localHour = get('hour') % 24; // hour12:false can emit 24 at midnight
  const localMin = get('minute');
  const localSec = get('second');

  // probeUtc is 12:00:00 UTC = localHour:localMin:localSec local
  // local midnight UTC = probeUtc − that local time offset
  const midnightUtcMs =
    probeUtc.getTime() -
    (localHour * 3_600_000 + localMin * 60_000 + localSec * 1_000);

  return {
    start: new Date(midnightUtcMs),
    end: new Date(midnightUtcMs + 86_400_000 - 1), // +24 h − 1 ms
  };
}

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
      const { start, end } = localDayUtcRange(filters.date, TIMEZONE);
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
