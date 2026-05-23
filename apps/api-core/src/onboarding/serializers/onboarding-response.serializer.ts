import { ApiProperty } from '@nestjs/swagger';
import { type ProductsWarning } from '../onboarding.service';

export class OnboardingResponseSerializer {
  @ApiProperty({ description: 'Número de productos creados durante el onboarding', example: 5 })
  productsCreated!: number;

  @ApiProperty({
    description: 'Presente si el procesamiento de productos falló. El restaurante y usuario fueron creados correctamente.',
    example: 'products_extraction_failed',
    required: false,
    enum: ['products_extraction_failed', 'products_creation_failed'],
  })
  productsWarning?: ProductsWarning;
}
