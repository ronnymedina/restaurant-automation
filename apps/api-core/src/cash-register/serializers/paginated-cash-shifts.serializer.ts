import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { CashShiftSerializer } from './cash-shift.serializer';

export class PaginatedCashShiftsSerializer {
  @ApiProperty({ type: [CashShiftSerializer] })
  @Type(() => CashShiftSerializer)
  data: CashShiftSerializer[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  constructor(partial: Partial<PaginatedCashShiftsSerializer>) {
    Object.assign(this, partial);
  }
}
