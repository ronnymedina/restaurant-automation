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

  @ApiProperty({
    description:
      'Presente solo en modo self-hosted (sin proveedor de email). URL para activar la cuenta admin directamente desde la UI.',
    example: 'http://192.168.1.50:8080/activate?token=2b1f...-uuid',
    required: false,
  })
  activationUrl?: string;
}
