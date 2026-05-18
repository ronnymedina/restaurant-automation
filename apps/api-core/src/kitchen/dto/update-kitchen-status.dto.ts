import { IsEnum } from 'class-validator';
import { $Enums } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateKitchenStatusDto {
  @ApiProperty({ enum: [$Enums.OrderStatus.PROCESSING, $Enums.OrderStatus.SERVED], description: 'Nuevo estado del pedido' })
  @IsEnum([$Enums.OrderStatus.PROCESSING, $Enums.OrderStatus.SERVED], {
    message: 'Kitchen can only advance to PROCESSING or SERVED',
  })
  status: $Enums.OrderStatus;
}
