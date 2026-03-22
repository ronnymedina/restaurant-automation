import { Injectable } from '@nestjs/common';
import { Table, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TablesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(restaurantId: string): Promise<Table[]> {
    return this.prisma.table.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<Table | null> {
    return this.prisma.table.findUnique({ where: { id } });
  }

  async create(data: {
    name: string;
    capacity: number;
    restaurantId: string;
  }): Promise<Table> {
    return this.prisma.table.create({ data });
  }

  async update(
    id: string,
    data: { name?: string; capacity?: number; active?: boolean },
  ): Promise<Table> {
    return this.prisma.table.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Table> {
    return this.prisma.table.delete({ where: { id } });
  }

  async countFutureReservations(tableId: string): Promise<number> {
    return this.prisma.reservation.count({
      where: {
        tableId,
        date: { gte: new Date() },
        status: {
          notIn: [
            ReservationStatus.CANCELLED,
            ReservationStatus.NO_SHOW,
            ReservationStatus.COMPLETED,
          ],
        },
      },
    });
  }
}
