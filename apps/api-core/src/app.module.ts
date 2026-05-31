import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { ProductsModule } from './products/products.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { csrfConfig } from './auth/csrf.config';
import { CsrfOriginGuard } from './auth/guards/csrf-origin.guard';
import { MenusModule } from './menus/menus.module';
import { OrdersModule } from './orders/orders.module';
import { CashRegisterModule } from './cash-register/cash-register.module';
import { KioskModule } from './kiosk/kiosk.module';
import { PrintModule } from './print/print.module';
import { UploadsModule } from './uploads/uploads.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { CacheModule } from './cache/cache.module';
import { validate } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({ validate, load: [csrfConfig] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    CacheModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/v1/{*path}', '/health', '/docs'],
    }),
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
    UploadsModule,
    KitchenModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: CsrfOriginGuard }],
})
export class AppModule {}
