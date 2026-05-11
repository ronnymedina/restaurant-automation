import { CashShift, CashShiftStatus } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { fromCents } from '../../common/helpers/money';

import { CashShiftWithUser } from '../cash-register-session.repository';

@Exclude()
export class CashShiftSerializer implements Omit<CashShift, 'openingBalance' | 'totalSales'> {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  restaurantId: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty({ enum: CashShiftStatus })
  @Expose()
  status: CashShiftStatus;

  @ApiProperty()
  @Expose()
  lastOrderNumber: number;

  @Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? fromCents(value) : 0))
  @ApiProperty()
  @Expose()
  openingBalance: number;

  @Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? fromCents(value) : null))
  @ApiPropertyOptional({ nullable: true })
  @Expose()
  totalSales: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  totalOrders: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedBy: string | null;

  @ApiProperty()
  @Expose()
  openedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  closedAt: Date | null;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  _count?: { orders: number };

  @ApiPropertyOptional({ type: Object, nullable: true })
  @Expose()
  user?: { id: string; email: string } | null;

  constructor(partial: Partial<CashShiftWithUser & { _count?: { orders: number }; user?: { id: string; email: string } | null }>) {
    Object.assign(this, partial);
  }
}
