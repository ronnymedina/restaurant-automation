import { ApiProperty } from '@nestjs/swagger';

export class AuthLoginResponseDto {
  @ApiProperty({ example: 'America/Lima', description: 'Restaurant timezone, used by the frontend to format dates' })
  timezone: string;

  @ApiProperty({ example: ',', description: 'Decimal separator for money formatting (e.g. "," → 1.234,56)' })
  decimalSeparator: string;

  @ApiProperty({ example: '.', description: 'Thousands separator for money formatting (e.g. "." → 1.234,56)' })
  thousandsSeparator: string;
}
