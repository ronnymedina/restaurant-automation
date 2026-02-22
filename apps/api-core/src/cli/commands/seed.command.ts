import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { ProductsService } from '../../products/products.service';
import { CategoriesService } from '../../products/categories.service';
import { MenusService } from '../../menus/menus.service';
import { MenuItemsService } from '../../menus/menu-items.service';
import { UsersService } from '../../users/users.service';
import { ProductRepository } from '../../products/product.repository';
import { Role } from '@prisma/client';

// ── Fake data pools ──────────────────────────────────────────────────────────

const CATEGORY_NAMES = [
  'Entradas', 'Sopas', 'Ensaladas', 'Carnes', 'Aves', 'Mariscos',
  'Pastas', 'Pizzas', 'Hamburguesas', 'Tacos', 'Sushi', 'Vegetariano',
  'Postres', 'Bebidas', 'Cócteles', 'Cafés', 'Desayunos', 'Sandwiches',
  'Wraps', 'Bowls',
];

const PRODUCT_NAMES = [
  'Alitas BBQ', 'Nachos con queso', 'Sopa de tomate', 'Caldo de res',
  'Ensalada César', 'Ensalada griega', 'Chuletón a la brasa', 'Costillas BBQ',
  'Pollo a la plancha', 'Pollo al curry', 'Camarones al ajillo', 'Pescado a la veracruzana',
  'Pasta carbonara', 'Fettuccine alfredo', 'Pizza margherita', 'Pizza cuatro quesos',
  'Hamburguesa clásica', 'Doble smash burger', 'Tacos al pastor', 'Tacos de birria',
  'Roll California', 'Nigiri salmón', 'Bowl de quinoa', 'Buddha bowl',
  'Brownie con helado', 'Cheesecake', 'Limonada natural', 'Agua de jamaica',
  'Café americano', 'Cappuccino', 'Chilaquiles rojos', 'Huevos benedictinos',
  'Sandwich caprese', 'Club sandwich', 'Wrap de pollo', 'Burrito de res',
  'Sopa azteca', 'Crema de elote', 'Pulpo a la gallega', 'Ceviche',
];

const PRODUCT_DESCRIPTIONS = [
  'Preparado con ingredientes frescos del día.',
  'Receta tradicional con un toque especial.',
  'Cocinado a fuego lento para mejor sabor.',
  'Con especias seleccionadas importadas.',
  'Opción favorita de nuestros clientes.',
  'Estilo casero, sabor inigualable.',
  'Porción generosa, ideal para compartir.',
  'Sin gluten, apto para celíacos.',
  'Alto en proteína, bajo en carbohidratos.',
  'Vegano y lleno de nutrientes.',
];

const MENU_NAMES = [
  'Menú del Día', 'Menú Desayuno', 'Menú Almuerzo', 'Menú Cena',
  'Menú Brunch', 'Menú Ejecutivo', 'Menú Fin de Semana', 'Menú Especial',
  'Menú Temporada', 'Menú Degustación',
];

const MENU_SECTIONS = ['Principal', 'Entradas', 'Postres', 'Bebidas', 'Especiales'];

const USER_PASSWORD = 'Seed1234!';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickUnique<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/** Genera N nombres únicos a partir de un pool, repitiendo con sufijo numérico si el pool es pequeño */
function generateNames(pool: string[], count: number, prefix: string): string[] {
  const result: string[] = [];
  let round = 0;
  while (result.length < count) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    for (const name of shuffled) {
      if (result.length >= count) break;
      result.push(round === 0 ? name : `${name} ${round + 1}`);
    }
    round++;
  }
  return result.slice(0, count);
}

function randomPrice(min = 5, max = 35): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomStock(min = 0, max = 100): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Command ──────────────────────────────────────────────────────────────────

interface SeedOptions {
  restaurantId: string;
  categories?: number;
  products?: number;
  menus?: number;
  itemsPerMenu?: number;
  users?: number;
}

@Command({
  name: 'seed',
  description:
    'Seed dummy data (categories, products, menus with items, users) into a restaurant. ' +
    'All module flags are optional — only those passed will be seeded.',
})
export class SeedCommand extends CommandRunner {
  private readonly logger = new Logger(SeedCommand.name);

  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
    private readonly productRepository: ProductRepository,
    private readonly menusService: MenusService,
    private readonly menuItemsService: MenuItemsService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  async run(_passedParams: string[], options: SeedOptions): Promise<void> {
    if (!options.restaurantId) {
      this.logger.error('--restaurant-id is required');
      return process.exit(1);
    }

    const nothingRequested =
      !options.categories && !options.products && !options.menus && !options.users;

    if (nothingRequested) {
      this.logger.warn(
        'No modules specified. Pass at least one of: --categories, --products, --menus, --users',
      );
      return;
    }

    const restaurantId = options.restaurantId;
    const results: string[] = [];

    try {
      // ── 1. Categories ──────────────────────────────────────────────────────
      let seededCategoryIds: string[] = [];

      if (options.categories && options.categories > 0) {
        const names = generateNames(CATEGORY_NAMES, options.categories, 'Categoría');
        const created = await Promise.all(
          names.map(name => this.categoriesService.createCategory(restaurantId, name)),
        );
        seededCategoryIds = created.map(c => c.id);
        results.push(`✓ ${created.length} categories created`);
      }

      // ── 2. Products ────────────────────────────────────────────────────────
      let seededProductIds: string[] = [];

      if (options.products && options.products > 0) {
        // Ensure there is at least one category to assign products to
        let categoryIds = seededCategoryIds;
        if (categoryIds.length === 0) {
          const defaultCat = await this.productsService.getOrCreateDefaultCategory(restaurantId);
          categoryIds = [defaultCat.id];
        }

        const names = generateNames(PRODUCT_NAMES, options.products, 'Producto');

        const created = await Promise.all(
          names.map(name =>
            this.productsService.createProduct(
              restaurantId,
              {
                name,
                description: pick(PRODUCT_DESCRIPTIONS),
                price: randomPrice(),
                stock: randomStock(),
              },
              pick(categoryIds),
            ),
          ),
        );
        seededProductIds = created.map(p => p.id);
        results.push(`✓ ${created.length} products created`);
      }

      // ── 3. Menus with items ────────────────────────────────────────────────
      if (options.menus && options.menus > 0) {
        // Get all products for this restaurant to use as menu items
        let productIds = seededProductIds;
        if (productIds.length === 0) {
          const existingProducts = await this.productRepository.findByRestaurantId(restaurantId);
          productIds = existingProducts.map(p => p.id);
        }

        const itemsPerMenu = options.itemsPerMenu ?? 5;
        const menuNames = generateNames(MENU_NAMES, options.menus, 'Menú');

        let totalItems = 0;
        for (const name of menuNames.slice(0, options.menus)) {
          const menu = await this.menusService.createMenu(restaurantId, { name, active: true });

          if (productIds.length > 0) {
            const itemProductIds = pickUnique(productIds, itemsPerMenu);
            const section = pick(MENU_SECTIONS);
            const count = await this.menuItemsService.bulkCreateItems(menu.id, itemProductIds, section);
            totalItems += count;
          }
        }
        results.push(`✓ ${options.menus} menus created with ${totalItems} total items`);
      }

      // ── 4. Users ───────────────────────────────────────────────────────────
      if (options.users && options.users > 0) {
        const timestamp = Date.now();
        const roles = [Role.BASIC, Role.MANAGER];
        const created: string[] = [];

        for (let i = 1; i <= options.users; i++) {
          const email = `seed_user_${timestamp}_${i}@demo.com`;
          const role = pick(roles);
          await this.usersService.createUser(email, USER_PASSWORD, role, restaurantId);
          created.push(email);
        }

        results.push(`✓ ${created.length} users created (password: ${USER_PASSWORD})`);
        created.forEach(email => this.logger.log(`  → ${email}`));
      }

      // ── Summary ────────────────────────────────────────────────────────────
      this.logger.log('\n========== SEED RESULTS ==========');
      results.forEach(r => this.logger.log(r));
      this.logger.log(`Restaurant ID: ${restaurantId}`);
      this.logger.log('==================================\n');
    } catch (error) {
      this.logger.error(
        `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return process.exit(1);
    }
  }

  @Option({
    flags: '--restaurant-id <restaurantId>',
    description: 'Target restaurant ID',
    required: true,
  })
  parseRestaurantId(val: string): string {
    return val;
  }

  @Option({
    flags: '--categories <n>',
    description: 'Number of categories to create',
  })
  parseCategories(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--products <n>',
    description: 'Number of products to create',
  })
  parseProducts(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--menus <n>',
    description: 'Number of menus to create (each with items)',
  })
  parseMenus(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--items-per-menu <n>',
    description: 'Number of items per menu (default: 5)',
  })
  parseItemsPerMenu(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--users <n>',
    description: 'Number of users to create (role randomly assigned as BASIC or MANAGER)',
  })
  parseUsers(val: string): number {
    return parseInt(val, 10);
  }
}
