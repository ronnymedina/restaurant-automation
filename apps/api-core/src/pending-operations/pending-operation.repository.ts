import { Injectable } from '@nestjs/common';
import { PendingOperationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PendingOperationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    type: PendingOperationType;
    payload: string;
    adminEmail: string;
    restaurantId: string;
    expiresAt: Date;
  }) {
    return this.prisma.pendingOperation.create({ data });
  }

  async findByToken(token: string) {
    return this.prisma.pendingOperation.findUnique({ where: { token } });
  }

  async markConfirmed(id: string) {
    return this.prisma.pendingOperation.update({
      where: { id },
      data: { confirmedAt: new Date() },
    });
  }

  async deleteExpired() {
    return this.prisma.pendingOperation.deleteMany({
      where: { expiresAt: { lt: new Date() }, confirmedAt: null },
    });
  }
}
