import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class OnboardingRegisterDto {
  @ApiProperty({
    description: 'Email del usuario',
    example: 'usuario@restaurante.com',
  })
  @IsEmail({}, { message: 'El email debe ser válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @ApiProperty({
    description: 'Nombre del restaurante',
    example: 'Mi Restaurante',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del restaurante es requerido' })
  restaurantName: string;

  @ApiPropertyOptional({
    description:
      'Si es true, se crean 3 productos demo en lugar de procesar fotos',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  skipProducts?: boolean;
}
