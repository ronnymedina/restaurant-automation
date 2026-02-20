import { Command, CommandRunner } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';
import { UsersService } from '../../users/users.service';
import { ProductsService } from '../../products/products.service';

const DUMMY_EMAIL = 'admin@demo.com';
const DUMMY_PASSWORD = '12345678';
const DUMMY_RESTAURANT_NAME = 'Demo Restaurant';

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
      const existingUser = await this.usersService.findByEmail(DUMMY_EMAIL);

      if (existingUser && existingUser.restaurantId) {
        const restaurant = await this.restaurantsService.findById(
          existingUser.restaurantId,
        );

        this.logger.log('Dummy data already exists:');
        this.logger.log('\n========== DUMMY DATA ==========');
        this.logger.log(`Restaurant: ${restaurant?.name ?? 'Unknown'}`);
        this.logger.log(`Slug:       ${restaurant?.slug ?? 'Unknown'}`);
        this.logger.log(`Email:      ${DUMMY_EMAIL}`);
        this.logger.log(`Password:   ${DUMMY_PASSWORD}`);
        this.logger.log('================================\n');
        return;
      }

      const restaurant = await this.restaurantsService.createRestaurant(
        DUMMY_RESTAURANT_NAME,
      );
      this.logger.log(
        `Restaurant created: ${restaurant.name} (${restaurant.id})`,
      );

      const user = await this.usersService.createAdminUser(
        DUMMY_EMAIL,
        DUMMY_PASSWORD,
        restaurant.id,
      );
      this.logger.log(`Admin user created: ${user.email} (${user.id})`);

      const category = await this.productsService.getOrCreateDefaultCategory(
        restaurant.id,
      );
      const productsCreated = await this.productsService.createDemoProducts(
        restaurant.id,
        category.id,
      );
      this.logger.log(`${productsCreated} demo products created`);

      this.logger.log('\n========== DUMMY DATA ==========');
      this.logger.log(`Restaurant: ${restaurant.name}`);
      this.logger.log(`Slug:       ${restaurant.slug}`);
      this.logger.log(`Email:      ${DUMMY_EMAIL}`);
      this.logger.log(`Password:   ${DUMMY_PASSWORD}`);
      this.logger.log('================================\n');
    } catch (error) {
      this.logger.error(
        `Failed to create dummy data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return process.exit(1);
    }
  }
}
