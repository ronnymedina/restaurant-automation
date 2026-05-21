import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CashShiftRepository } from '../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from './exceptions/cash-register.exceptions';

export interface ShiftCounts {
  total: number;
  created: number;
  confirmed: number;
  processing: number;
  served: number;
  completed: number;
  cancelled: number;
  pending: number;
}

export interface ShiftRevenue {
  completed: bigint;
  pending: bigint;
  averageTicket: bigint;
}

export interface ShiftTopProduct {
  id: string;
  name: string;
  quantity: number;
  total: bigint;
}

export interface ShiftStats {
  counts: ShiftCounts;
  revenue: ShiftRevenue;
  byPaymentMethod: Array<{ method: string; count: number; total: bigint }>;
  byOrderType: Array<{ type: string; count: number }>;
  byOrderSource: Array<{ source: string; count: number }>;
  topProducts: ShiftTopProduct[];
}

export function emptyShiftStats(): ShiftStats {
  return {
    counts: {
      total: 0, created: 0, confirmed: 0, processing: 0,
      served: 0, completed: 0, cancelled: 0, pending: 0,
    },
    revenue: { completed: 0n, pending: 0n, averageTicket: 0n },
    byPaymentMethod: [],
    byOrderType: [],
    byOrderSource: [],
    topProducts: [],
  };
}

@Injectable()
export class CashRegisterStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashShiftRepository: CashShiftRepository,
  ) {}

  async getStats(_sessionId: string, _restaurantId: string): Promise<ShiftStats> {
    throw new Error('Not implemented');
  }
}
