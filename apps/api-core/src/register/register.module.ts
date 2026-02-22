import { Module } from '@nestjs/common';

import { RegisterService } from './register.service';
import { RegisterController } from './register.controller';
import { RegisterSessionRepository } from './register-session.repository';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [RegisterController],
  providers: [RegisterService, RegisterSessionRepository],
  exports: [RegisterService, RegisterSessionRepository],
})
export class RegisterModule {}
