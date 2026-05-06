import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelKitchenOrderDto {
  @ApiProperty({ description: 'Motivo de cancelación (mínimo 3 caracteres)' })
  @IsString()
  @MinLength(3)
  reason: string;
}
