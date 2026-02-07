import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { ProductsModule } from '../products/products.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [RestaurantsModule, ProductsModule, AiModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule { }
