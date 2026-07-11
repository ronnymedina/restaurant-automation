import {
  IsString,
  IsNotEmpty,
  IsOptional,
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

  @ApiPropertyOptional({ example: 'Para Empezar', maxLength: 255, description: 'Sección visual en la carta' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sectionName?: string;

  @ApiPropertyOptional({ example: 1, description: 'Posición dentro de la sección' })
  @IsOptional()
  @IsInt()
  order?: number;
}
