import { Module, forwardRef } from '@nestjs/common';

import { PrintService } from './print.service';
import { PrintController } from './print.controller';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [forwardRef(() => OrdersModule), RestaurantsModule],
  controllers: [PrintController],
  providers: [PrintService],
  exports: [PrintService],
})
export class PrintModule {}
