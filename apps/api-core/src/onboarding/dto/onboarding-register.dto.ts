import {
  Allow,
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
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
    description: 'Nombre del restaurante. Solo letras, acentos, espacios, guion medio y guion bajo. Máximo 60 caracteres.',
    example: 'Mi Restaurante',
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del restaurante es requerido' })
  @MaxLength(60, { message: 'El nombre del restaurante no puede superar 60 caracteres' })
  @Matches(/^[a-zA-ZÀ-ÿ \-_]+$/, {
    message: 'El nombre del restaurante solo puede contener letras, acentos, espacios, guión medio y guión bajo',
  })
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
  createDemoData?: boolean;

  // Whitelisted to prevent 400 when multipart sends photos as a text field.
  // Real file validation is handled by ParseFilePipe in the controller.
  @IsOptional()
  @Allow()
  photos?: unknown;
}

class OnboardingPhotosDto {
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Fotos del menú para extraer productos (máximo 3, solo PNG/JPG)',
  })
  photos?: unknown[];
}

export class OnboardingRegisterSwaggerDto extends IntersectionType(
  OnboardingRegisterDto,
  OnboardingPhotosDto,
) {}
