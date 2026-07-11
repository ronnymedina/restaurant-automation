import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { CashShiftWithCountSerializer } from './cash-shift-with-count.serializer';

export class PaginatedCashShiftsSerializer {
  @ApiProperty({ type: [CashShiftWithCountSerializer] })
  @Type(() => CashShiftWithCountSerializer)
  data: CashShiftWithCountSerializer[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  constructor(partial: Partial<PaginatedCashShiftsSerializer>) {
    Object.assign(this, partial);
  }
}
