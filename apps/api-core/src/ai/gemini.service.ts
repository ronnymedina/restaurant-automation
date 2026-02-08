import * as fs from 'node:fs';
import path from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { aiConfig } from './ai.config';

export interface ExtractedProduct {
  name: string;
  description?: string;
  price?: number;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;

  constructor(
    @Inject(aiConfig.KEY)
    private readonly configService: ConfigType<typeof aiConfig>) {
    const apiKey = this.configService.apiKey as string;
    const modelToUse = this.configService.model as string;

    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured. AI features will be disabled.');
      return;
    }

    if (!modelToUse) {
      throw new Error('GEMINI_MODEL not configured');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelToUse });
    this.logger.log('Gemini AI initialized successfully with model: ', modelToUse);
  }

  isConfigured(): boolean {
    return this.model !== null;
  }

  async extractProductsFromImage(
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg',
  ): Promise<ExtractedProduct[]> {
    if (!this.model) {
      this.logger.warn('Gemini not configured, returning empty products');
      return [];
    }

    try {
      const base64Image = imageBuffer.toString('base64');
      const prompt = this.getPromptFromFile('extract-products-from-menu.md');
      const requestContent = {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      }

      const result = await this.model.generateContent([
        requestContent,
        prompt,
      ]);

      const response = result.response;
      const text = response.text();

      // Parse JSON response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('Could not parse JSON from Gemini response');
        return [];
      }

      const products: ExtractedProduct[] = JSON.parse(jsonMatch[0]);
      this.logger.log(`Extracted ${products.length} products from image`);

      return products;
    } catch (error) {
      this.logger.error('Error extracting products from image', error);
      return [];
    }
  }

  async extractProductsFromMultipleImages(
    images: Array<{ buffer: Buffer; mimeType: string }>,
  ): Promise<ExtractedProduct[]> {
    const allProducts: ExtractedProduct[] = [];

    for (const image of images) {
      const products = await this.extractProductsFromImage(
        image.buffer,
        image.mimeType,
      );
      allProducts.push(...products);
    }

    // Remove duplicates by name
    const uniqueProducts = allProducts.reduce(
      (acc: ExtractedProduct[], product) => {
        const exists = acc.find(
          (p) => p.name.toLowerCase() === product.name.toLowerCase(),
        );
        if (!exists) {
          acc.push(product);
        }
        return acc;
      },
      [],
    );

    return uniqueProducts;
  }

  getPromptFromFile(fileName: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', fileName), 'utf-8');
  }
}
