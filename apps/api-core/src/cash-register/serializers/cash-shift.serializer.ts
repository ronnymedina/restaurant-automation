import { CashShift, CashShiftStatus } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class CashShiftSerializer implements Omit<CashShift, 'openingBalance' | 'totalSales' | 'userId'> {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  restaurantId: string;

  @ApiProperty({ enum: CashShiftStatus })
  @Expose()
  status: CashShiftStatus;

  @ApiProperty()
  @Expose()
  lastOrderNumber: number;

  @Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? Number(value) : 0))
  @ApiProperty()
  @Expose()
  openingBalance: number;

  @Transform(({ value }: { value: bigint | null | undefined }) => (value != null ? Number(value) : null))
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

  constructor(partial: Partial<CashShift & { _count?: { orders: number } }>) {
    Object.assign(this, partial);
  }
}
