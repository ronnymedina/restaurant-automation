import {
  Allow,
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  IsIn,
  Matches,
  MaxLength,
  IsTimeZone,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { LATAM_COUNTRY_CODES } from '../data/latam-countries';

export class OnboardingRegisterDto {
  @ApiProperty({
    description: 'Owner email address',
    example: 'owner@restaurant.com',
  })
  @IsEmail({}, { message: 'email must be valid' })
  @IsNotEmpty({ message: 'email is required' })
  email: string;

  @ApiProperty({
    description: 'Restaurant name. Letters, accents, spaces, hyphen and underscore only. Max 60 characters.',
    example: 'Mi Restaurante',
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty({ message: 'restaurantName is required' })
  @MaxLength(60, { message: 'restaurantName must not exceed 60 characters' })
  @Matches(/^[a-zA-ZÀ-ÿ \-_]+$/, {
    message: 'restaurantName may only contain letters, accents, spaces, hyphen and underscore',
  })
  restaurantName: string;

  @ApiProperty({
    description: 'IANA timezone of the restaurant, obtained from the browser.',
    example: 'America/Argentina/Buenos_Aires',
  })
  @IsTimeZone({ message: 'timezone must be a valid IANA timezone' })
  @IsNotEmpty({ message: 'timezone is required' })
  timezone: string;

  @ApiProperty({
    description: 'Supported LATAM country (ISO 3166-1 alpha-2).',
    example: 'CL',
  })
  @IsIn(LATAM_COUNTRY_CODES, { message: 'country must be a supported LATAM ISO code' })
  @IsNotEmpty({ message: 'country is required' })
  country: string;

  @ApiPropertyOptional({
    description: 'Decimal separator. Defaults to the country convention if omitted.',
    enum: ['.', ','],
    example: ',',
  })
  @IsOptional()
  @IsIn(['.', ','], { message: 'decimalSeparator must be "." or ","' })
  decimalSeparator?: '.' | ',';

  @ApiPropertyOptional({
    description: 'If true, creates 5 demo products with a sample menu',
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
    description: 'Menu photo to extract products from (1 photo, max 5MB, PNG/JPG only)',
  })
  photo?: unknown;
}

export class OnboardingRegisterSwaggerDto extends IntersectionType(
  OnboardingRegisterDto,
  OnboardingPhotosDto,
) {}
