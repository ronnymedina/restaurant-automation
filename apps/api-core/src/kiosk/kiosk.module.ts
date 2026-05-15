import { Module } from '@nestjs/common';

import { KioskService } from './kiosk.service';
import { KioskController } from './kiosk.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { MenusModule } from '../menus/menus.module';
import { OrdersModule } from '../orders/orders.module';
import { CashRegisterModule } from '../cash-register/cash-register.module';
import { CashShiftModule } from '../cash-shift/cash-shift.module';

@Module({
  imports: [RestaurantsModule, MenusModule, OrdersModule, CashRegisterModule, CashShiftModule],
  controllers: [KioskController],
  providers: [KioskService],
})
export class KioskModule {}
