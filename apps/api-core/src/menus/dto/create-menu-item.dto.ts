import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'uuid-producto', description: 'ID del producto a agregar al menú' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: 9.99, description: 'Precio override (si no se indica, usa el precio del producto)' })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: 20, description: 'Stock específico en este menú (null = usa stock global)' })
  @IsOptional()
  @IsInt()
  stock?: number;

  @ApiPropertyOptional({ example: 'Para Empezar', maxLength: 255, description: 'Sección visual en la carta' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sectionName?: string;

  @ApiPropertyOptional({ example: 1, description: 'Posición dentro de la sección' })
  @IsOptional()
  @IsInt()
  order?: number;
}
