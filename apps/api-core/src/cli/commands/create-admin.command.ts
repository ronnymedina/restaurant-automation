import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { UsersService } from '../../users/users.service';

@Command({
  name: 'create-admin',
  description: 'Create an admin user',
})
export class CreateAdminCommand extends CommandRunner {
  private readonly logger = new Logger(CreateAdminCommand.name);

  constructor(private readonly usersService: UsersService) {
    super();
  }

  async run(
    _passedParams: string[],
    options: { email: string; password: string; restaurantId: string },
  ): Promise<void> {
    if (!options.email || !options.password || !options.restaurantId) {
      this.logger.error(
        '--email, --password, and --restaurant-id are all required',
      );
      return process.exit(1);
    }

    try {
      const user = await this.usersService.createAdminUser(
        options.email,
        options.password,
        options.restaurantId,
      );
      this.logger.log(
        `Admin user created successfully: ${user.email} (${user.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create admin: ${error instanceof Error ? error.message : String(error)}`,
      );
      return process.exit(1);
    }
  }

  @Option({
    flags: '-e, --email <email>',
    description: 'Admin email address',
    required: true,
  })
  parseEmail(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --password <password>',
    description: 'Admin password (min 8 characters)',
    required: true,
  })
  parsePassword(val: string): string {
    return val;
  }

  @Option({
    flags: '--restaurant-id <restaurantId>',
    description: 'Restaurant ID to associate with the admin',
    required: true,
  })
  parseRestaurantId(val: string): string {
    return val;
  }
}
