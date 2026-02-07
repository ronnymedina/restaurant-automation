import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

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

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey && apiKey !== 'your-api-key-here') {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      this.logger.log('Gemini AI initialized successfully');
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not configured. AI features will be disabled.',
      );
    }
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

      const prompt = `Analiza esta imagen de un menú de restaurante y extrae todos los productos que puedas identificar.

Para cada producto, proporciona la siguiente información en formato JSON:
- name: nombre del producto (obligatorio)
- description: descripción del producto si está visible
- price: precio numérico sin símbolos de moneda (ej: 15.50)

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional. Ejemplo:
[
  {"name": "Hamburguesa Clásica", "description": "Con queso, lechuga y tomate", "price": 12.50},
  {"name": "Coca Cola", "price": 3.00}
]

Si no puedes identificar productos, responde con un array vacío: []`;

      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
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
}
