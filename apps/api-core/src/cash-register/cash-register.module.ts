import { Module } from '@nestjs/common';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';
import { CashRegisterSessionRepository } from './cash-register-session.repository';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService, CashRegisterSessionRepository],
  exports: [CashRegisterService, CashRegisterSessionRepository],
})
export class CashRegisterModule {}
