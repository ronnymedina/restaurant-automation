import { Injectable, Logger } from '@nestjs/common';
import { Restaurant } from '@prisma/client';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { ProductsService, ProductInput } from '../products/products.service';
import { GeminiService } from '../ai/gemini.service';
import { ImageProcessingException } from '../ai/exceptions/ai.exceptions';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  OnboardingFailedException,
  EmailAlreadyExistsException,
} from './exceptions/onboarding.exceptions';

const SourceData = {
  DEMO: 'demo',
  AI_EXTRACTED: 'ai_extracted',
  NONE: 'none',
} as const;

export interface OnboardingResult {
  restaurant: Restaurant;
  productsCreated: number;
  batches: number;
  source: (typeof SourceData)[keyof typeof SourceData];
  emailSent: boolean;
}

export interface OnboardingInput {
  email: string;
  restaurantName: string;
  skipProducts?: boolean;
  photos?: Array<{ buffer: Buffer; mimeType: string }>;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly productsService: ProductsService,
    private readonly geminiService: GeminiService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  async registerRestaurant(input: OnboardingInput): Promise<OnboardingResult> {
    this.logger.log(
      `Starting onboarding for restaurant: ${input.restaurantName}`,
    );

    try {
      // 1. Verify email is not already in use (before creating anything)
      const existingUser = await this.usersService.findByEmail(input.email);
      if (existingUser) {
        throw new EmailAlreadyExistsException(input.email);
      }

      // 2. Create the restaurant
      const restaurant = await this.createRestaurant(input.restaurantName);
      this.logger.log(`Restaurant created with ID: ${restaurant.id}`);

      // 3. Create user linked to restaurant
      const user = await this.usersService.createOnboardingUser(
        input.email,
        restaurant.id,
      );
      this.logger.log(`User created with ID: ${user.id}`);

      // 4. Send activation email (token only sent via email, never in API response)
      const emailSent = await this.emailService.sendActivationEmail(
        user.email,
        user.activationToken!,
      );

      if (!emailSent) {
        this.logger.warn(`Activation email could not be sent to ${user.email}`);
      }

      // 5. Create default category (single source of truth for category ID)
      const defaultCategory =
        await this.productsService.getOrCreateDefaultCategory(restaurant.id);
      this.logger.log(
        `Default category created with ID: ${defaultCategory.id}`,
      );

      // 6. Handle products based on input
      if (input.skipProducts) {
        this.logger.log('Creating demo products');
        return this.handleDemoProducts(
          restaurant,
          defaultCategory.id,
          emailSent,
        );
      }

      if (input.photos && input.photos.length > 0) {
        this.logger.log(
          `Processing ${input.photos.length} photos with Gemini AI`,
        );
        return this.handlePhotoExtraction(
          restaurant,
          defaultCategory.id,
          input.photos,
          emailSent,
        );
      }

      this.logger.log('No photos provided and skip not selected');
      return this.handleNoProducts(restaurant, emailSent);
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof OnboardingFailedException ||
        error instanceof ImageProcessingException ||
        error instanceof EmailAlreadyExistsException
      ) {
        throw error;
      }

      // Wrap unknown errors
      this.logger.error('Unexpected error during onboarding', error);
      throw new OnboardingFailedException('Unexpected error occurred', {
        // originalError stripped — logged server-side only
      });
    }
  }

  private async createRestaurant(name: string): Promise<Restaurant> {
    try {
      const restaurant = await this.restaurantsService.createRestaurant(name);
      return restaurant;
    } catch (error) {
      this.logger.error('Failed to create restaurant', error);
      throw new OnboardingFailedException('Failed to create restaurant', {
        restaurantName: name,
        // originalError stripped — logged server-side only
      });
    }
  }

  private async handleDemoProducts(
    restaurant: Restaurant,
    categoryId: string,
    emailSent: boolean,
  ): Promise<OnboardingResult> {
    try {
      const demoCount = await this.productsService.createDemoProducts(
        restaurant.id,
        categoryId,
      );

      return {
        restaurant,
        productsCreated: demoCount,
        batches: 1,
        source: SourceData.DEMO,
        emailSent,
      };
    } catch (error) {
      this.logger.error('Failed to create demo products', error);
      throw new OnboardingFailedException('Failed to create demo products', {
        restaurantId: restaurant.id,
        // originalError stripped — logged server-side only
      });
    }
  }

  private async handlePhotoExtraction(
    restaurant: Restaurant,
    categoryId: string,
    photos: Array<{ buffer: Buffer; mimeType: string }>,
    emailSent: boolean,
  ): Promise<OnboardingResult> {
    const extractedProducts =
      await this.geminiService.extractProductsFromMultipleImages(photos);

    // If no products extracted, fall back to demo products
    if (extractedProducts.length === 0) {
      this.logger.warn(
        'No products extracted from images, creating demo products',
      );
      return this.handleDemoProducts(restaurant, categoryId, emailSent);
    }

    // Convert extracted products to ProductInput format
    const productInputs: ProductInput[] = extractedProducts.map((p) => ({
      name: p.name,
      description: p.description,
      price: p.price,
    }));

    this.logger.log(`Creating ${productInputs.length} products in batches`);

    try {
      const { totalCreated, batches } =
        await this.productsService.createProductsBatch(
          restaurant.id,
          categoryId,
          productInputs,
        );

      return {
        restaurant,
        productsCreated: totalCreated,
        batches,
        source: SourceData.AI_EXTRACTED,
        emailSent,
      };
    } catch (error) {
      this.logger.error('Failed to create products batch', error);
      throw new OnboardingFailedException('Failed to save extracted products', {
        restaurantId: restaurant.id,
        productCount: productInputs.length,
        // originalError stripped — logged server-side only
      });
    }
  }

  private handleNoProducts(
    restaurant: Restaurant,
    emailSent: boolean,
  ): OnboardingResult {
    return {
      restaurant,
      productsCreated: 0,
      batches: 0,
      emailSent,
      source: SourceData.NONE,
    };
  }
}
