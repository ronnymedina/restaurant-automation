import { Injectable, Logger } from '@nestjs/common';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ProductsService, ProductInput } from '../products/products.service';
import { GeminiService } from '../ai/gemini.service';
import { Restaurant } from '@prisma/client';

export interface OnboardingResult {
  restaurant: Restaurant;
  productsCreated: number;
  batches: number;
  source: 'demo' | 'ai_extracted' | 'none';
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
    const restaurant = await this.restaurantsService.createRestaurant(
      input.restaurantName,
    );
    this.logger.log(`Restaurant created with ID: ${restaurant.id}`);

    // 2. Handle products based on input
    if (input.skipProducts) {
      // Skip option: create demo products
      this.logger.log('Skip option selected, creating demo products');
      const demoCount = await this.productsService.createDemoProducts(
        restaurant.id,
      );

      return {
        restaurant,
        productsCreated: demoCount,
        batches: 1,
        source: 'demo',
      };
    }

    if (input.photos && input.photos.length > 0) {
      // Process photos with Gemini AI
      if (!this.geminiService.isConfigured()) {
        this.logger.warn(
          'Gemini not configured, falling back to demo products',
        );
        const demoCount = await this.productsService.createDemoProducts(
          restaurant.id,
        );

        return {
          restaurant,
          productsCreated: demoCount,
          batches: 1,
          source: 'demo',
        };
      }

      this.logger.log(`Processing ${input.photos.length} photos with Gemini AI`);
      const extractedProducts =
        await this.geminiService.extractProductsFromMultipleImages(
          input.photos,
        );

      if (extractedProducts.length === 0) {
        this.logger.warn('No products extracted from images, creating demo products');
        const demoCount = await this.productsService.createDemoProducts(
          restaurant.id,
        );

        return {
          restaurant,
          productsCreated: demoCount,
          batches: 1,
          source: 'demo',
        };
      }

      // Convert extracted products to ProductInput format
      // All AI-extracted products use 'default' category
      const productInputs: ProductInput[] = extractedProducts.map((p) => ({
        name: p.name,
        description: p.description,
        price: p.price,
        category: 'default',
      }));

      this.logger.log(`Creating ${productInputs.length} products in batches`);
      const { totalCreated, batches } =
        await this.productsService.createProductsBatch(
          restaurant.id,
          productInputs,
        );

      return {
        restaurant,
        productsCreated: totalCreated,
        batches,
        source: 'ai_extracted',
      };
    }

    // No photos and not skipping - return restaurant with no products
    this.logger.log('No photos provided and skip not selected');
    return {
      restaurant,
      productsCreated: 0,
      batches: 0,
      source: 'none',
    };
  }
}
