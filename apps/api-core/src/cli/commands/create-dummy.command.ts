import { Command, CommandRunner } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';
import { UsersService } from '../../users/users.service';
import { ProductsService } from '../../products/products.service';
import { MenusService } from '../../menus/menus.service';
import { MenuItemsService } from '../../menus/menu-items.service';

const DUMMY_EMAIL = 'admin@demo.com';
const DUMMY_PASSWORD = '12345678';
const DUMMY_RESTAURANT_NAME = 'Demo Restaurant';

@Command({
  name: 'create-dummy',
  description:
    'Create a demo restaurant with an admin user, sample products and a demo menu',
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

      // Create demo products with real prices
      const demoProductsData = [
        { name: 'Hamburguesa Clásica', description: 'Carne de res, lechuga, tomate y queso', price: 8.50 },
        { name: 'Pizza Margherita', description: 'Salsa de tomate, mozzarella y albahaca', price: 12.00 },
        { name: 'Ensalada César', description: 'Lechuga romana, crutones y aderezo César', price: 6.50 },
        { name: 'Limonada Natural', description: 'Limonada fresca con hielo', price: 2.50 },
        { name: 'Brownie de Chocolate', description: 'Brownie caliente con helado de vainilla', price: 4.00 },
      ];

      const createdProducts: { id: string; name: string }[] = [];
      for (const p of demoProductsData) {
        const product = await this.productsService.createProduct(
          restaurant.id,
          { name: p.name, description: p.description, price: p.price },
          category.id,
        );
        createdProducts.push({ id: product.id, name: product.name });
      }
      this.logger.log(`${createdProducts.length} demo products created`);

      // Create a demo menu with all products
      const menu = await this.menusService.createMenu(restaurant.id, {
        name: 'Carta General',
        active: true,
      });
      this.logger.log(`Demo menu created: ${menu.name} (${menu.id})`);

      const sections = [
        { label: 'Principales', ids: [createdProducts[0].id, createdProducts[1].id] },
        { label: 'Entradas', ids: [createdProducts[2].id] },
        { label: 'Bebidas', ids: [createdProducts[3].id] },
        { label: 'Postres', ids: [createdProducts[4].id] },
      ];

      for (const section of sections) {
        await this.menuItemsService.bulkCreateItems(
          menu.id,
          section.ids,
          section.label,
        );
      }
      this.logger.log(`Demo menu items created across ${sections.length} sections`);

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
