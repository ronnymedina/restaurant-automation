import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenameRestaurantDto {
  @ApiProperty({ example: 'Mi Restaurante Nuevo' })
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede superar los 255 caracteres' })
  name: string;
}
