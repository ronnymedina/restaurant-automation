import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantRepository } from './restaurant.repository';

@Module({
  providers: [RestaurantsService, RestaurantRepository],
  exports: [RestaurantsService, RestaurantRepository],
})
export class RestaurantsModule {}
