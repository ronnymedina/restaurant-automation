import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsValidCurrencyCode } from './validators/is-valid-currency-code.validator';

export class UpdateRestaurantSettingsDto {
  @ApiPropertyOptional({ example: 'Mi Restaurante', maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({
    example: 'America/Santiago',
    description: 'IANA timezone; debe pertenecer al country actual del restaurante',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Código ISO 4217' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsValidCurrencyCode()
  currency?: string;

  @ApiPropertyOptional({ example: '.', enum: ['.', ','] })
  @IsOptional()
  @IsIn(['.', ','])
  decimalSeparator?: string;
}
