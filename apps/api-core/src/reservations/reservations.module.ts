import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsRepository } from './reservations.repository';
import { TablesModule } from '../tables/tables.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [TablesModule, RestaurantsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationsRepository],
  exports: [ReservationsService, ReservationsRepository],
})
export class ReservationsModule {}
