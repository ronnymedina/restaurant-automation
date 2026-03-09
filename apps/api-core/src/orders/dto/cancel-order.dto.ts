import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelOrderDto {
  @ApiProperty({ example: 'Pedido duplicado por error del cliente' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
