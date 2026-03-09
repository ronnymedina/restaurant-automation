import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsPositive,
  IsBoolean,
  IsUUID,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Hamburguesa Clásica', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Con lechuga, tomate y cheddar', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 12.5, description: 'Precio del producto' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiPropertyOptional({ example: 50, description: 'Stock global (null = ilimitado, 0 = agotado)' })
  @IsOptional()
  @IsInt()
  stock?: number;

  @ApiPropertyOptional({ example: 'HAM-001', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ example: 'https://example.com/imagen.jpg' })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  imageUrl?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ example: 'uuid-categoria', description: 'ID de la categoría' })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;
}
