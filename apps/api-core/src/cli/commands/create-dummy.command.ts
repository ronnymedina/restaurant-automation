import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';
import { UsersService } from '../../users/users.service';
import { ProductsService } from '../../products/products.service';
import { MenusService } from '../../menus/menus.service';
import { MenuItemsService } from '../../menus/menu-items.service';

const DEFAULT_EMAIL = 'admin@demo.com';
const DUMMY_PASSWORD = '12345678';
const DUMMY_RESTAURANT_NAME = 'Demo Restaurant';

interface DummyOptions {
  email?: string;
}

@Command({
  name: 'create-dummy',
  description:
    'Create a demo restaurant with an admin user, sample products and a demo menu. ' +
    'Safe to re-run — skips any resource that already exists.',
})
export class CreateDummyCommand extends CommandRunner {
  private readonly logger = new Logger(CreateDummyCommand.name);

  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    private readonly menusService: MenusService,
    private readonly menuItemsService: MenuItemsService,
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

      // ── 3. Products (only if none exist for this restaurant) ─────────
      const existingProducts = await this.productsService.findByRestaurantId(restaurantId);
      let productIds: string[];

      if (existingProducts.length > 0) {
        this.logger.log(`Products already exist (${existingProducts.length}), skipping`);
        productIds = existingProducts.map((p) => p.id);
      } else {
        const category = await this.productsService.getOrCreateDefaultCategory(restaurantId);

        const demoProducts = [
          { name: 'Hamburguesa Clásica', description: 'Carne de res, lechuga, tomate y queso', price: 8.50 },
          { name: 'Pizza Margherita', description: 'Salsa de tomate, mozzarella y albahaca', price: 12.00 },
          { name: 'Ensalada César', description: 'Lechuga romana, crutones y aderezo César', price: 6.50 },
          { name: 'Limonada Natural', description: 'Limonada fresca con hielo', price: 2.50 },
          { name: 'Brownie de Chocolate', description: 'Brownie caliente con helado de vainilla', price: 4.00 },
        ];

        productIds = [];
        for (const p of demoProducts) {
          const product = await this.productsService.createProduct(
            restaurantId,
            { name: p.name, description: p.description, price: p.price },
            category.id,
          );
          productIds.push(product.id);
        }
        this.logger.log(`${productIds.length} demo products created`);
      }

      // ── 4. Menu (only if none exist for this restaurant) ─────────────
      const existingMenus = await this.menusService.findByRestaurantId(restaurantId);
      if (existingMenus.length > 0) {
        this.logger.log(`Menu already exists (${existingMenus.length}), skipping`);
      } else {
        const menu = await this.menusService.createMenu(restaurantId, {
          name: 'Carta General',
          active: true,
        });

        const sections = [
          { label: 'Principales', ids: productIds.slice(0, 2) },
          { label: 'Entradas',    ids: productIds.slice(2, 3) },
          { label: 'Bebidas',     ids: productIds.slice(3, 4) },
          { label: 'Postres',     ids: productIds.slice(4, 5) },
        ];

        for (const section of sections) {
          if (section.ids.length > 0) {
            await this.menuItemsService.bulkCreateItems(menu.id, section.ids, section.label);
          }
        }
        this.logger.log(`Demo menu "${menu.name}" created with ${sections.length} sections`);
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
