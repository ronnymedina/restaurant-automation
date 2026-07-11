import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { CashShiftSerializer } from './cash-shift.serializer';
import { CashShiftWithUserAndCount } from '../../cash-shift/cash-shift.repository';

@Exclude()
class OrderCount {
  @ApiProperty()
  @Expose()
  orders: number;

  constructor(partial: { orders: number }) {
    this.orders = partial.orders;
  }
}

@Exclude()
export class CashShiftWithCountSerializer extends CashShiftSerializer {
  @ApiProperty({ type: OrderCount })
  @Expose()
  _count: OrderCount;

  constructor(
    partial: Partial<CashShiftWithUserAndCount & { _count?: { orders: number } }>,
    timezone = 'UTC',
  ) {
    super(partial as any, timezone);
    this._count = new OrderCount(partial._count ?? { orders: 0 });
  }
}
