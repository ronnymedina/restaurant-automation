import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { EventsGateway } from './events.gateway';
import { ProductEventsService } from './products.events';
import { OrderEventsService } from './orders.events';
import { KioskEventsService } from './kiosk.events';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { JWT_SECRET } from '../config';

@Module({
  imports: [
    JwtModule.register({ secret: JWT_SECRET }),
    RestaurantsModule,
  ],
  providers: [EventsGateway, ProductEventsService, OrderEventsService, KioskEventsService],
  exports: [EventsGateway, ProductEventsService, OrderEventsService, KioskEventsService],
})
export class EventsModule {}
