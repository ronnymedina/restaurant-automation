import { Module } from '@nestjs/common';

import { CashRegisterService } from './cash-register.service';
import { CashRegisterStatsService } from './cash-register-stats.service';
import { CashRegisterController } from './cash-register.controller';
import { CashShiftGuard } from './guards/cash-shift.guard';
import { CashShiftModule } from '../cash-shift/cash-shift.module';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [CashShiftModule, OrdersModule, RestaurantsModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService, CashRegisterStatsService, CashShiftGuard],
  exports: [CashRegisterService],
})
export class CashRegisterModule {}
