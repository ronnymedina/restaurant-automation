import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateKitchenTokenDto {
  @ApiProperty({ description: 'Fecha de vencimiento (ISO8601). Mínimo: mañana.' })
  @IsDateString()
  expiresAt!: string;
}
