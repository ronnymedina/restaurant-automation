import { Injectable, Logger } from '@nestjs/common';
import { Restaurant } from '@prisma/client';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { ProductsService, ProductInput } from '../products/products.service';
import { GeminiService } from '../ai/gemini.service';

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
}

export interface OnboardingInput {
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
  ) { }

  async registerRestaurant(input: OnboardingInput): Promise<OnboardingResult> {
    this.logger.log(`Starting onboarding for restaurant: ${input.restaurantName}`);

    // 1. Create the restaurant
    const restaurant = await this.createRestaurant(input.restaurantName);
    this.logger.log(`Restaurant created with ID: ${restaurant.id}`);

    // 2. Create default category (single source of truth for category ID)
    const defaultCategory = await this.productsService.getOrCreateDefaultCategory(restaurant.id);
    this.logger.log(`Default category created with ID: ${defaultCategory.id}`);

    // 3. Handle products based on input
    if (input.skipProducts) {
      this.logger.log('Creating demo products');
      return this.handleDemoProducts(restaurant, defaultCategory.id);
    }

    if (input.photos && input.photos.length > 0) {
      this.logger.log(`Processing ${input.photos.length} photos with Gemini AI`);
      return this.handlePhotoExtraction(restaurant, defaultCategory.id, input.photos);
    }

    this.logger.log('No photos provided and skip not selected');
    return this.handleNoProducts(restaurant);
  }

  private async createRestaurant(name: string): Promise<Restaurant> {
    const restaurant = await this.restaurantsService.createRestaurant(name);
    return restaurant;
  }

  private async handleDemoProducts(
    restaurant: Restaurant,
    categoryId: string,
  ): Promise<OnboardingResult> {
    const demoCount = await this.productsService.createDemoProducts(
      restaurant.id,
      categoryId,
    );

    return {
      restaurant,
      productsCreated: demoCount,
      batches: 1,
      source: SourceData.DEMO,
    };
  }

  private async handlePhotoExtraction(
    restaurant: Restaurant,
    categoryId: string,
    photos: Array<{ buffer: Buffer; mimeType: string }>,
  ): Promise<OnboardingResult> {
    const extractedProducts = await this.geminiService.extractProductsFromMultipleImages(photos);

    // If no products extracted, fall back to demo products
    if (extractedProducts.length === 0) {
      this.logger.warn('No products extracted from images, creating demo products');
      return this.handleDemoProducts(restaurant, categoryId);
    }

    // Convert extracted products to ProductInput format
    const productInputs: ProductInput[] = extractedProducts.map((p) => ({
      name: p.name,
      description: p.description,
      price: p.price,
    }));

    this.logger.log(`Creating ${productInputs.length} products in batches`);
    const { totalCreated, batches } = await this.productsService.createProductsBatch(
      restaurant.id,
      categoryId,
      productInputs,
    );

    return {
      restaurant,
      productsCreated: totalCreated,
      batches,
      source: SourceData.AI_EXTRACTED,
    };
  }

  private handleNoProducts(restaurant: Restaurant): OnboardingResult {
    return {
      restaurant,
      productsCreated: 0,
      batches: 0,
      source: SourceData.NONE,
    };
  }
}
