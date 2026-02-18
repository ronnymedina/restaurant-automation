import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { ProductsModule } from '../products/products.module';
import { CreateAdminCommand } from './commands/create-admin.command';
import { CreateRestaurantCommand } from './commands/create-restaurant.command';
import { CreateDummyCommand } from './commands/create-dummy.command';

@Module({
  imports: [PrismaModule, UsersModule, RestaurantsModule, ProductsModule],
  providers: [CreateAdminCommand, CreateRestaurantCommand, CreateDummyCommand],
})
export class CliModule {}
