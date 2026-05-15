import { Module, forwardRef } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderRepository } from './order.repository';
import { EmailModule } from '../email/email.module';
import { PrintModule } from '../print/print.module';
import { EventsModule } from '../events/events.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { CashShiftModule } from '../cash-shift/cash-shift.module';

@Module({
  imports: [EmailModule, forwardRef(() => PrintModule), EventsModule, RestaurantsModule, CashShiftModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
