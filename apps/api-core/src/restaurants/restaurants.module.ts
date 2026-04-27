import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { RestaurantsController } from './restaurants.controller';
import { TimezoneService } from './timezone.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantRepository, TimezoneService],
  exports: [RestaurantsService, RestaurantRepository, TimezoneService],
})
export class RestaurantsModule {}
