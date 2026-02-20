import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';

@Command({
  name: 'create-restaurant',
  description: 'Create a restaurant',
})
export class CreateRestaurantCommand extends CommandRunner {
  private readonly logger = new Logger(CreateRestaurantCommand.name);

  constructor(private readonly restaurantsService: RestaurantsService) {
    super();
  }

  async run(_passedParams: string[], options: { name: string }): Promise<void> {
    if (!options.name) {
      this.logger.error('--name is required');
      return process.exit(1);
    }

    try {
      const restaurant = await this.restaurantsService.createRestaurant(
        options.name,
      );
      this.logger.log(
        `Restaurant created successfully:\n  id:   ${restaurant.id}\n  name: ${restaurant.name}\n  slug: ${restaurant.slug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create restaurant: ${error instanceof Error ? error.message : String(error)}`,
      );
      return process.exit(1);
    }
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Restaurant name',
    required: true,
  })
  parseName(val: string): string {
    return val;
  }
}
