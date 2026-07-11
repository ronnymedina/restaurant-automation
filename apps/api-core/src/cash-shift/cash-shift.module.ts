import { Module } from '@nestjs/common';
import { CashShiftRepository } from './cash-shift.repository';

@Module({
  providers: [CashShiftRepository],
  exports: [CashShiftRepository],
})
export class CashShiftModule {}
