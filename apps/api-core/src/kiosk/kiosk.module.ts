import { Module } from '@nestjs/common';

import { KioskService } from './kiosk.service';
import { KioskController } from './kiosk.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { MenusModule } from '../menus/menus.module';
import { OrdersModule } from '../orders/orders.module';
import { RegisterModule } from '../register/register.module';

@Module({
  imports: [RestaurantsModule, MenusModule, OrdersModule, RegisterModule],
  controllers: [KioskController],
  providers: [KioskService],
})
export class KioskModule {}
