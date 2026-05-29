import { Module } from '@nestjs/common';

import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { KitchenTokenService } from './kitchen-token.service';
import { KitchenTokenGuard } from './guards/kitchen-token.guard';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { OrdersModule } from '../orders/orders.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [RestaurantsModule, OrdersModule, EventsModule],
  controllers: [KitchenController],
  providers: [KitchenService, KitchenTokenService, KitchenTokenGuard],
})
export class KitchenModule {}
