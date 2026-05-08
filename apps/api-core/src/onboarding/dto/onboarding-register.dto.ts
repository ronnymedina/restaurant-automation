import {
  Allow,
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  Matches,
  MaxLength,
  IsTimeZone,
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

  @ApiProperty({
    description: 'Zona horaria IANA del restaurante, obtenida del navegador.',
    example: 'America/Argentina/Buenos_Aires',
  })
  @IsTimeZone({ message: 'El timezone debe ser una zona horaria IANA válida' })
  @IsNotEmpty({ message: 'El timezone es requerido' })
  timezone: string;

  @ApiPropertyOptional({
    description: 'Si es true, se crean 5 productos demo con un menú de ejemplo',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  createDemoData?: boolean;

  // Whitelisted to prevent 400 when multipart sends photo as a text field.
  @IsOptional()
  @Allow()
  photo?: unknown;
}

class OnboardingPhotosDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Foto del menú para extraer productos (1 foto, max 5MB, solo PNG/JPG)',
  })
  photo?: unknown;
}

export class OnboardingRegisterSwaggerDto extends IntersectionType(
  OnboardingRegisterDto,
  OnboardingPhotosDto,
) {}
