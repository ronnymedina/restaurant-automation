import { CashShift, CashShiftStatus } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CashShiftWithUser } from '../cash-register-session.repository';

@Exclude()
export class CashShiftSerializer implements Pick<CashShift, 'id' | 'status'> {
  @ApiProperty()
  @Expose()
  id: string;

  // not exposed: restaurantId, userId, lastOrderNumber, openingBalance, totalSales, totalOrders
  restaurantId: string;
  userId: string;
  lastOrderNumber: number;
  openingBalance: bigint;
  totalSales: bigint | null;
  totalOrders: number | null;
  openedAt: Date;
  closedAt: Date | null;

  @ApiProperty({ enum: CashShiftStatus })
  @Expose()
  status: CashShiftStatus;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedBy: string | null;

  @ApiProperty()
  @Expose()
  displayOpenedAt: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  displayClosedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  openedByEmail: string | null;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  _count?: { orders: number };

  constructor(
    partial: Partial<CashShiftWithUser & { _count?: { orders: number } }>,
    timezone = 'UTC',
  ) {
    Object.assign(this, partial);
    const fmt = new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    this.displayOpenedAt = fmt.format(new Date(partial.openedAt!));
    this.displayClosedAt = partial.closedAt ? fmt.format(new Date(partial.closedAt)) : null;
    this.openedByEmail = (partial as any).user?.email ?? null;
  }
}
