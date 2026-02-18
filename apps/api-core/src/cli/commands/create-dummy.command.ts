import { Command, CommandRunner } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';
import { UsersService } from '../../users/users.service';
import { ProductsService } from '../../products/products.service';

@Command({
  name: 'create-dummy',
  description:
    'Create a demo restaurant with an admin user and sample products',
})
export class CreateDummyCommand extends CommandRunner {
  private readonly logger = new Logger(CreateDummyCommand.name);

  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
  ) {
    super();
  }

  async run(): Promise<void> {
    try {
      const restaurant =
        await this.restaurantsService.createRestaurant('Demo Restaurant');
      this.logger.log(
        `Restaurant created: ${restaurant.name} (${restaurant.id})`,
      );

      const user = await this.usersService.createAdminUser(
        'admin@demo.com',
        'admin1234',
        restaurant.id,
      );
      this.logger.log(`Admin user created: ${user.email} (${user.id})`);

      const category =
        await this.productsService.getOrCreateDefaultCategory(restaurant.id);
      const productsCreated = await this.productsService.createDemoProducts(
        restaurant.id,
        category.id,
      );
      this.logger.log(`${productsCreated} demo products created`);

      this.logger.log('\n========== DUMMY DATA ==========');
      this.logger.log(`Restaurant: ${restaurant.name}`);
      this.logger.log(`Slug:       ${restaurant.slug}`);
      this.logger.log(`Email:      admin@demo.com`);
      this.logger.log(`Password:   admin1234`);
      this.logger.log('================================\n');
    } catch (error) {
      this.logger.error(
        `Failed to create dummy data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return process.exit(1);
    }
  }
}
