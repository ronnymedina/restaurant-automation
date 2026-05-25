import { ApiProperty } from '@nestjs/swagger';

export class RestaurantSettingsDto {
  @ApiProperty({ example: 'America/Santiago' })
  timezone: string;

  @ApiProperty({ example: 'CL', description: 'ISO 3166-1 alpha-2 country code' })
  country: string;

  @ApiProperty({ example: 'CLP', description: 'ISO 4217 currency code' })
  currency: string;

  @ApiProperty({ example: ',' })
  decimalSeparator: string;

  @ApiProperty({ example: '.' })
  thousandsSeparator: string;
}

// Defaults applied when a restaurant has no settings row yet.
// Kept in one place so controller, services and tests stay in sync.
export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettingsDto = {
  timezone: 'UTC',
  country: 'CL',
  currency: 'CLP',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};
