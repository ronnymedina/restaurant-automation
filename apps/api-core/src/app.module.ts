import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { ProductsModule } from './products/products.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { MenusModule } from './menus/menus.module';
import { OrdersModule } from './orders/orders.module';
import { RegisterModule } from './register/register.module';
import { KioskModule } from './kiosk/kiosk.module';
import { PrintModule } from './print/print.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    EventsModule,
    PrismaModule,
    RestaurantsModule,
    ProductsModule,
    MenusModule,
    OnboardingModule,
    UsersModule,
    EmailModule,
    AuthModule,
    OrdersModule,
    RegisterModule,
    KioskModule,
    PrintModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
