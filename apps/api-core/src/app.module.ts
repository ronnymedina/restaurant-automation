import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { ProductsModule } from './products/products.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [
    EventsModule,
    PrismaModule,
    RestaurantsModule,
    ProductsModule,
    OnboardingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
