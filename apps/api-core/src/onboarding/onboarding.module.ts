import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { ProductsModule } from '../products/products.module';
import { MenusModule } from '../menus/menus.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { EmailThrottlerGuard } from './guards/email-throttler.guard';

@Module({
  imports: [
    RestaurantsModule,
    ProductsModule,
    MenusModule,
    AiModule,
    UsersModule,
    EmailModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, EmailThrottlerGuard],
  exports: [OnboardingService],
})
export class OnboardingModule {}
