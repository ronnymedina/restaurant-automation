import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenameRestaurantDto {
  @ApiProperty({ example: 'Mi Restaurante Nuevo' })
  @IsString()
  @MinLength(2)
  name: string;
}
