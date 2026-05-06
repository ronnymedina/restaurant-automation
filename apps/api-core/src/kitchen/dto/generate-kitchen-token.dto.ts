import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateKitchenTokenDto {
  @ApiPropertyOptional({ description: 'Fecha de vencimiento (ISO8601). Mínimo: mañana. Por defecto: 60 días.' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
