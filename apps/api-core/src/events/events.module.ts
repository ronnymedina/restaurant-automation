import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { EventsGateway } from './events.gateway';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { JWT_SECRET } from '../config';

@Module({
  imports: [
    JwtModule.register({ secret: JWT_SECRET }),
    RestaurantsModule,
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
