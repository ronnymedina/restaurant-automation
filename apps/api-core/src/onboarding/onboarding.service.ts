import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Restaurant, User } from '@prisma/client';
import { randomUUID } from 'crypto';
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
  UserNotFoundException,
} from './exceptions/onboarding.exceptions';
import { UserAlreadyActiveException } from '../users/exceptions/users.exceptions';

type TransactionClient = Prisma.TransactionClient;

export interface OnboardingResult {
  productsCreated: number;
}

export interface OnboardingInput {
  email: string;
  restaurantName: string;
  timezone?: string;
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
    this.logger.log(`Starting onboarding for restaurant: ${input.restaurantName}`);

    // 1. Validate email uniqueness before creating anything
    const existingUser = await this.usersService.findByEmail(input.email);
    if (existingUser) {
      throw new EmailAlreadyExistsException(input.email);
    }

    // 2. Create restaurant + user + default category atomically
    const { restaurant, user, defaultCategoryId } = await this.setupCoreEntities(input);

    // 5. Handle products
    const productsCreated = await this.resolveProducts(restaurant.id, defaultCategoryId, input);

    // 6. Send activation email LAST — after all DB operations succeed
    try {
      const sent = await this.emailService.sendActivationEmail(user.email, user.activationToken!);
      if (sent) {
        this.logger.log(`Activation email dispatched to ${user.email}`);
      } else {
        this.logger.warn(`Activation email could not be sent to ${user.email}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send activation email to ${user.email}`, error);
    }

    return { productsCreated };
  }

  private async setupCoreEntities(
    input: OnboardingInput,
  ): Promise<{ restaurant: Restaurant; user: User; defaultCategoryId: string }> {
    try {
      return await this.prisma.$transaction(async (tx: TransactionClient) => {
        let restaurant: Restaurant;
        try {
          restaurant = await this.restaurantsService.createRestaurant(input.restaurantName, input.timezone, tx);
        } catch (error) {
          this.logger.error('Failed to create restaurant', error);
          throw new RestaurantCreationFailedException({ restaurantName: input.restaurantName });
        }

        let user: User;
        try {
          user = await this.usersService.createOnboardingUser(input.email, restaurant.id, tx);
        } catch (error) {
          this.logger.error('Failed to create onboarding user', error);
          throw new UserCreationFailedException({ email: input.email });
        }

        let defaultCategoryId: string;
        try {
          const category = await this.productsService.getOrCreateDefaultCategory(restaurant.id, tx);
          defaultCategoryId = category.id;
        } catch (error) {
          this.logger.error('Failed to create default category', error);
          throw new OnboardingFailedException('Failed to create default category');
        }

        this.logger.log(`Core entities created — restaurant: ${restaurant.id}, user: ${user.id}`);
        return { restaurant, user, defaultCategoryId };
      });
    } catch (error) {
      if (
        error instanceof RestaurantCreationFailedException ||
        error instanceof UserCreationFailedException ||
        error instanceof OnboardingFailedException
      ) {
        throw error;
      }
      this.logger.error('Unexpected error during core entity setup', error);
      throw new OnboardingFailedException('Unexpected error during setup');
    }
  }

  private async resolveProducts(
    restaurantId: string,
    categoryId: string,
    input: Pick<OnboardingInput, 'photo' | 'createDemoData'>,
  ): Promise<number> {
    if (input.photo) {
      this.logger.log('Processing photo with Gemini AI');
      return this.tryPhotoExtraction(restaurantId, categoryId, input.photo);
    }

    if (input.createDemoData) {
      this.logger.log('Creating demo products and menu');
      try {
        return await this.handleDemoProducts(restaurantId, categoryId);
      } catch (error) {
        this.logger.error('Failed to create demo products', error);
        throw new OnboardingFailedException('Failed to create demo products');
      }
    }

    return 0;
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

  async resendActivation(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UserNotFoundException(email);
    }

    if (user.isActive) {
      throw new UserAlreadyActiveException(email);
    }

    const newToken = randomUUID();
    await this.usersService.refreshActivationToken(user.id, newToken);

    try {
      const sent = await this.emailService.sendActivationEmail(email, newToken);
      if (!sent) {
        this.logger.warn(`Activation email could not be resent to ${email}`);
      }
    } catch (error) {
      this.logger.error(`Failed to resend activation email to ${email}`, error);
    }
  }
}
