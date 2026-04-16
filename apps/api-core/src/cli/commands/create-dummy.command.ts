import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';
import { UsersService } from '../../users/users.service';

const DEFAULT_EMAIL = 'admin@demo.com';
const DUMMY_PASSWORD = '12345678';
const DUMMY_RESTAURANT_NAME = 'Demo Restaurant';

interface DummyOptions {
  email?: string;
}

@Command({
  name: 'create-dummy',
  description:
    'Create a demo restaurant with an admin user. ' +
    'Safe to re-run — skips any resource that already exists.',
})
export class CreateDummyCommand extends CommandRunner {
  private readonly logger = new Logger(CreateDummyCommand.name);

  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  @Option({
    flags: '-e, --email [email]',
    description: `Admin email for the dummy account (default: ${DEFAULT_EMAIL})`,
  })
  parseEmail(val: string): string {
    return val;
  }

  async run(_passedParams: string[], options: DummyOptions = {}): Promise<void> {
    const adminEmail = options.email ?? DEFAULT_EMAIL;

    try {
      // ── 1. Restaurant ───────────────────────────────────────────────
      let restaurantId: string;
      let restaurantSlug: string;

      const existingUser = await this.usersService.findByEmail(adminEmail);
      if (existingUser?.restaurantId) {
        const restaurant = await this.restaurantsService.findById(existingUser.restaurantId);
        restaurantId = existingUser.restaurantId;
        restaurantSlug = restaurant?.slug ?? 'unknown';
        this.logger.log(`Restaurant already exists: ${restaurant?.name} (${restaurantId})`);
      } else {
        const restaurant = await this.restaurantsService.createRestaurant(DUMMY_RESTAURANT_NAME);
        restaurantId = restaurant.id;
        restaurantSlug = restaurant.slug;
        this.logger.log(`Restaurant created: ${restaurant.name} (${restaurantId})`);

        // ── 2. Admin user ──────────────────────────────────────────────
        const user = await this.usersService.createAdminUser(adminEmail, DUMMY_PASSWORD, restaurantId);
        this.logger.log(`Admin user created: ${user.email} (${user.id})`);
      }

      this.logger.log('\n========== DUMMY DATA ==========');
      this.logger.log(`Restaurant: ${DUMMY_RESTAURANT_NAME}`);
      this.logger.log(`Slug:       ${restaurantSlug}`);
      this.logger.log(`Email:      ${adminEmail}`);
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
