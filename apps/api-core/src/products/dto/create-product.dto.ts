import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsPositive,
  IsBoolean,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { toCents } from '../../common/helpers/money';
import { IsBigInt, MinBigInt } from '../../common/decorators/is-bigint.decorator';

export class CreateProductDto {
  @ApiProperty({ example: 'Hamburguesa Clásica', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Con lechuga, tomate y cheddar', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 1250, description: 'Precio del producto en pesos (entero). Ej: 1250 = $12.50' })
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      try {
        return toCents(value);
      } catch (e) {
        return value; // If it fails (e.g., float number), return the original so IsBigInt catches it
      }
    }
    return value;
  })
  @IsBigInt()
  @MinBigInt(0n, { message: 'El precio no puede ser negativo' })
  price: bigint;

  @ApiPropertyOptional({ example: 50, description: 'Stock global. null = ilimitado, 0 = agotado' })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'El stock no puede ser negativo' })
  @Max(9999, { message: 'El stock no puede superar 9999 unidades' })
  stock?: number;

  @ApiPropertyOptional({ example: 'HAM-001', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ example: 'https://example.com/imagen.jpg' })
  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/.+|\/.+)/, { message: 'imageUrl must be a URL address' })
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
