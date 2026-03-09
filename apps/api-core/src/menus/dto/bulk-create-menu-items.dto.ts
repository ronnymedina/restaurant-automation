import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkCreateMenuItemsDto {
  @ApiProperty({ type: [String], example: ['uuid-1', 'uuid-2'], description: 'IDs de productos a agregar (máx. 50)', maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  productIds: string[];

  @ApiProperty({ example: 'Platos Principales', maxLength: 255, description: 'Sección visual en la carta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sectionName: string;
}
