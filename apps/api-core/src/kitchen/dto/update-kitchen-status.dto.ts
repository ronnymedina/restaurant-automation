import { IsEnum } from 'class-validator';
import { $Enums } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateKitchenStatusDto {
  @ApiProperty({ enum: [$Enums.OrderStatus.PROCESSING, $Enums.OrderStatus.COMPLETED], description: 'Nuevo estado del pedido' })
  @IsEnum([$Enums.OrderStatus.PROCESSING, $Enums.OrderStatus.COMPLETED], {
    message: 'Kitchen can only advance to PROCESSING or COMPLETED',
  })
  status: $Enums.OrderStatus;
}
