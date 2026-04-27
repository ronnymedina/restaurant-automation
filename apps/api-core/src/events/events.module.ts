import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { SseService } from './sse.service';
import { EventsController } from './events.controller';
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
  controllers: [EventsController],
  providers: [SseService, ProductEventsService, OrderEventsService, KioskEventsService],
  exports: [SseService, ProductEventsService, OrderEventsService, KioskEventsService],
})
export class EventsModule {}
