import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { SseService } from './sse.service';
import { EventsController } from './events.controller';
import { ProductEventsService } from './products.events';
import { OrderEventsService } from './orders.events';
import { KioskEventsService } from './kiosk.events';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { JWT_SECRET } from '../config';
import { KitchenTokenService } from '../kitchen/kitchen-token.service';

@Module({
  imports: [
    JwtModule.register({ secret: JWT_SECRET }),
    RestaurantsModule,
  ],
  controllers: [EventsController],
  // KitchenTokenService is registered as a local provider here to avoid a
  // circular module dependency: KitchenModule already imports EventsModule
  // (because the kitchen module uses SSE), so EventsModule cannot import
  // KitchenModule directly. The service is stateless (pure crypto helpers),
  // so a separate instance is safe.
  providers: [
    SseService,
    ProductEventsService,
    OrderEventsService,
    KioskEventsService,
    KitchenTokenService,
  ],
  exports: [SseService, ProductEventsService, OrderEventsService, KioskEventsService],
})
export class EventsModule {}
