import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Restaurant, User } from '@prisma/client';
import { MAX_ONBOARDING_PRODUCTS } from '../config';

import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ProductsService } from '../products/products.service';
import { MenusService } from '../menus/menus.service';
import { MenuItemsService } from '../menus/menu-items.service';
import { GeminiService } from '../ai/gemini.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  OnboardingFailedException,
  EmailAlreadyExistsException,
  RestaurantCreationFailedException,
  UserCreationFailedException,
  DefaultCategoryCreationFailedException,
} from './exceptions/onboarding.exceptions';
import { findLatamCountry } from './data/latam-countries';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ct: { getCountry: (id: string) => { timezones: string[] } | null } = require('countries-and-timezones');

type TransactionClient = Prisma.TransactionClient;

export type ProductsWarning = 'products_extraction_failed' | 'products_creation_failed';

export interface OnboardingResult {
  productsCreated: number;
  productsWarning?: ProductsWarning;
  activationUrl?: string;
}

export interface OnboardingInput {
  email: string;
  restaurantName: string;
  country: string;
  timezone?: string;
  decimalSeparator?: '.' | ',';
  createDemoData?: boolean;
  photo?: { buffer: Buffer; mimeType: string };
}

const DEMO_PRODUCTS = [
  { name: 'Hamburguesa Clásica', description: 'Hamburguesa con queso y vegetales frescos', price: 899 },
  { name: 'Pizza Margherita', description: 'Pizza con salsa de tomate y mozzarella', price: 1050 },
  { name: 'Pasta Carbonara', description: 'Pasta con salsa cremosa y tocino', price: 975 },
  { name: 'Limonada Natural', description: 'Limonada fresca con menta', price: 350 },
  { name: 'Agua Mineral', description: 'Agua mineral 500ml', price: 150 },
] as const;

const DEMO_SECTIONS = {
  MAIN: 'Platos Principales',
  DRINKS: 'Bebidas',
} as const;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantsService: RestaurantsService,
    private readonly productsService: ProductsService,
    private readonly menusService: MenusService,
    private readonly menuItemsService: MenuItemsService,
    private readonly geminiService: GeminiService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  async registerRestaurant(input: OnboardingInput): Promise<OnboardingResult> {
    this.logger.log(`Starting onboarding for restaurant: === ${input.restaurantName} ===`);
    this.logger.log(input)

    // 1. Validate email uniqueness before creating anything
    await this.validateEmail(input.email);

    // 2. Create restaurant + user + default category atomically
    const { restaurant, user, defaultCategoryId } = await this.setupCoreEntities(input);

    // 3. Send activation email right after core setup — independent of products
    await this.sendActivationEmail(user.email, user.activationToken!);

    // Self-hosted (sin proveedor de email): exponer el link para que la UI lo muestre.
    // Con email configurado, el link va por correo y NO se expone en la respuesta.
    const activationUrl = this.emailService.isEnabled()
      ? undefined
      : this.emailService.buildActivationUrl(user.activationToken!);

    // 4. Process products — non-fatal, failure returns a warning for the frontend
    const { count: productsCreated, warning: productsWarning } = await this.resolveProducts(restaurant.id, defaultCategoryId, input);

    return { productsCreated, productsWarning, activationUrl };
  }

  private async sendActivationEmail(email: string, token: string): Promise<void> {
    const EMAIL_TIMEOUT_MS = 5000;
    const sent = await this.emailService.sendActivationEmail(email, token, EMAIL_TIMEOUT_MS);
    if (sent) {
      this.logger.log(`Activation email dispatched to ${email}`);
    } else {
      this.logger.warn(`Activation email could not be sent to ${email}`);
    }
  }

  private async validateEmail(email: string): Promise<void> {
    if (await this.usersService.existsByEmail(email)) {
      throw new EmailAlreadyExistsException(email);
    }
  }

  private resolveLocalization(input: OnboardingInput): {
    country: string;
    currency: string;
    decimalSeparator: string;
    thousandsSeparator: string;
    timezone: string;
  } {
    const country = findLatamCountry(input.country);
    if (!country) {
      // El DTO ya valida @IsIn, pero defendemos el invariante.
      throw new OnboardingFailedException(`Unsupported country: ${input.country}`);
    }
    const decimalSeparator = input.decimalSeparator ?? country.decimalSeparator;
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';

    const countryTimezones = ct.getCountry(country.code)?.timezones ?? [];
    const timezone =
      input.timezone && countryTimezones.includes(input.timezone)
        ? input.timezone
        : country.primaryTimezone;

    return { country: country.code, currency: country.currency, decimalSeparator, thousandsSeparator, timezone };
  }

  private async setupCoreEntities(
    input: OnboardingInput,
  ): Promise<{ restaurant: Restaurant; user: User; defaultCategoryId: string }> {
    try {
      return await this.prisma.$transaction(async (tx: TransactionClient) => {
        const { restaurantName, email } = input;

        this.logger.log("Creating restaurant...")
        const restaurant = await this.createRestaurant(input, tx);
        this.logger.log("The restaurant was successfully created")

        this.logger.log("Creating the user")
        const user = await this.createOnboardingUser(email, restaurant.id, restaurantName, tx);
        this.logger.log("The user was successfully created")

        this.logger.log("Creating default category")
        const defaultCategoryId = await this.createDefaultCategory(restaurant.id, tx);
        this.logger.log("The category was successfully created")

        this.logger.log(`Core entities created — email: ${email} - restaurant: ${restaurant.id}, user: ${user.id}`);
        return { restaurant, user, defaultCategoryId };
      });
    } catch (error) {
      if (
        error instanceof RestaurantCreationFailedException ||
        error instanceof UserCreationFailedException ||
        error instanceof DefaultCategoryCreationFailedException ||
        error instanceof OnboardingFailedException
      ) {
        this.logger.error('Unexpected error during core entity setup', error);
        throw error;
      }

      this.logger.error('Unexpected error during core entity setup', error);
      throw new OnboardingFailedException('Unexpected error during setup');
    }
  }

  private async createRestaurant(
    input: OnboardingInput,
    tx: TransactionClient,
  ): Promise<Restaurant> {
    const loc = this.resolveLocalization(input);
    try {
      return await this.restaurantsService.createRestaurant({ name: input.restaurantName, ...loc }, tx);
    } catch (error) {
      throw new RestaurantCreationFailedException({ restaurantName: input.restaurantName });
    }
  }

  private async createOnboardingUser(
    email: string,
    restaurantId: string,
    restaurantName: string,
    tx: TransactionClient,
  ): Promise<User> {
    try {
      return await this.usersService.createOnboardingUser(email, restaurantId, tx);
    } catch (error) {
      throw new UserCreationFailedException({ email, restaurantName });
    }
  }

  private async createDefaultCategory(
    restaurantId: string,
    tx: TransactionClient,
  ): Promise<string> {
    try {
      const category = await this.productsService.createDefaultCategory(restaurantId, tx);
      return category.id;
    } catch (error) {
      throw new DefaultCategoryCreationFailedException({ restaurantId });
    }
  }

  private async resolveProducts(
    restaurantId: string,
    categoryId: string,
    input: Pick<OnboardingInput, 'photo' | 'createDemoData'>,
  ): Promise<{ count: number; warning?: ProductsWarning }> {
    if (input.photo) {
      this.logger.log('Processing photo with Gemini AI');
      const count = await this.tryPhotoExtraction(restaurantId, categoryId, input.photo);
      const warning = count === 0 ? 'products_extraction_failed' : undefined;
      return { count, warning };
    }

    if (input.createDemoData) {
      this.logger.log('Creating demo products and menu');
      try {
        const count = await this.handleDemoProducts(restaurantId, categoryId);
        return { count };
      } catch (error) {
        this.logger.error('Failed to create demo products', error);
        return { count: 0, warning: 'products_creation_failed' };
      }
    }

    return { count: 0 };
  }

  private async tryPhotoExtraction(
    restaurantId: string,
    categoryId: string,
    photo: NonNullable<OnboardingInput['photo']>,
  ): Promise<number> {
    try {
      return await this.handlePhotoExtraction(restaurantId, categoryId, photo);
    } catch (error) {
      this.logger.error('Photo extraction failed — continuing without products', error);
      return 0;
    }
  }

  private async handleDemoProducts(restaurantId: string, categoryId: string): Promise<number> {
    const products = await Promise.all(
      DEMO_PRODUCTS.map((p) =>
        this.productsService.createProduct(restaurantId, { ...p, price: BigInt(p.price), categoryId }),
      ),
    );

    const menu = await this.menusService.createMenu(restaurantId, {
      name: 'Menú Principal',
      active: true,
    });

    const mainDishIds = products.slice(0, 3).map((p) => p.id);
    const drinkIds = products.slice(3).map((p) => p.id);

    await this.menuItemsService.bulkCreateItems(menu.id, mainDishIds, DEMO_SECTIONS.MAIN);
    await this.menuItemsService.bulkCreateItems(menu.id, drinkIds, DEMO_SECTIONS.DRINKS);

    return products.length;
  }

  private async handlePhotoExtraction(
    restaurantId: string,
    categoryId: string,
    photo: { buffer: Buffer; mimeType: string },
  ): Promise<number> {
    const extractedProducts = await this.geminiService.extractProductsFromMultipleImages([photo]);

    if (extractedProducts.length === 0) {
      this.logger.warn('No products extracted from images');
      return 0;
    }

    const validProducts = extractedProducts
      .filter((p) => p.price !== undefined && p.price > 0)
      .map((p) => ({
        name: p.name,
        description: p.description,
        price: BigInt(Math.round(p.price as number)),
      }));

    const capped = validProducts.slice(0, MAX_ONBOARDING_PRODUCTS);

    if (capped.length === 0) {
      this.logger.warn('No products with valid prices extracted from image');
      return 0;
    }

    this.logger.log(`Creating ${capped.length} extracted products in batches`);
    const { totalCreated } = await this.productsService.createProductsBatch(
      restaurantId,
      categoryId,
      capped,
    );

    return totalCreated;
  }

}
