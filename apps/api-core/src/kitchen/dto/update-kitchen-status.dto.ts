import { IsEnum } from 'class-validator';
import { $Enums } from '@prisma/client';

export class UpdateKitchenStatusDto {
  @IsEnum([$Enums.OrderStatus.PROCESSING, $Enums.OrderStatus.COMPLETED], {
    message: 'Kitchen can only advance to PROCESSING or COMPLETED',
  })
  status: $Enums.OrderStatus;
}
