import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class OnboardingRegisterDto {
  @ApiProperty({
    description: 'Nombre del restaurante',
    example: 'Mi Restaurante',
  })
  @IsString()
  restaurantName: string;

  @ApiPropertyOptional({
    description: 'Si es true, se crean 3 productos demo en lugar de procesar fotos',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  skipProducts?: boolean;
}
