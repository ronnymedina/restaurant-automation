import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRestaurantSettingsDto {
  @ApiPropertyOptional({
    example: 90,
    description: 'Duración estimada por reserva en minutos',
    minimum: 15,
    maximum: 480,
  })
  @IsInt()
  @Min(15)
  @Max(480)
  @IsOptional()
  defaultReservationDuration?: number;
}
