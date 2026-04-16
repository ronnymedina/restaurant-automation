import { Module } from '@nestjs/common';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';
import { CashShiftRepository } from './cash-register-session.repository';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService, CashShiftRepository],
  exports: [CashRegisterService, CashShiftRepository],
})
export class CashRegisterModule {}
