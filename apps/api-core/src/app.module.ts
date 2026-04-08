import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { UPLOADS_PATH, API_PUBLIC_PATH } from './config';
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
import { CashRegisterModule } from './cash-register/cash-register.module';
import { KioskModule } from './kiosk/kiosk.module';
import { PrintModule } from './print/print.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ServeStaticModule.forRoot(
      {
        rootPath: UPLOADS_PATH,
        serveRoot: '/uploads',
      },
      {
        rootPath: API_PUBLIC_PATH,
        serveRoot: '/',
        serveStaticOptions: { fallthrough: true },
      },
    ),
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
    CashRegisterModule,
    KioskModule,
    PrintModule,
    KitchenModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
