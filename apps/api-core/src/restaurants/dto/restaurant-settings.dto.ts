import { ApiProperty } from '@nestjs/swagger';

export class RestaurantSettingsDto {
  @ApiProperty({ example: 'Mi Restaurante' })
  name: string;

  @ApiProperty({ example: 'mi-restaurante', description: 'URL slug; read-only en la UI' })
  slug: string;

  @ApiProperty({ example: 'America/Santiago' })
  timezone: string;

  @ApiProperty({ example: 'CL', description: 'ISO 3166-1 alpha-2; read-only en este endpoint' })
  country: string;

  @ApiProperty({ example: 'CLP', description: 'ISO 4217 currency code' })
  currency: string;

  @ApiProperty({ example: ',' })
  decimalSeparator: string;

  @ApiProperty({ example: '.' })
  thousandsSeparator: string;
}

// Defaults applied when a restaurant has no settings row yet.
export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettingsDto = {
  name: '',
  slug: '',
  timezone: 'UTC',
  country: 'CL',
  currency: 'CLP',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};
