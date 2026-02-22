import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { ProductsModule } from '../products/products.module';
import { MenusModule } from '../menus/menus.module';
import { CreateAdminCommand } from './commands/create-admin.command';
import { CreateRestaurantCommand } from './commands/create-restaurant.command';
import { CreateDummyCommand } from './commands/create-dummy.command';
import { SeedCommand } from './commands/seed.command';

@Module({
  imports: [PrismaModule, UsersModule, RestaurantsModule, ProductsModule, MenusModule],
  providers: [CreateAdminCommand, CreateRestaurantCommand, CreateDummyCommand, SeedCommand],
})
export class CliModule {}
