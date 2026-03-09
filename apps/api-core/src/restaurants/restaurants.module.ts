import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';
import { RestaurantsController } from './restaurants.controller';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantRepository],
  exports: [RestaurantsService, RestaurantRepository],
})
export class RestaurantsModule {}
