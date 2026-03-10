import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateKitchenStatusDto {
  @IsEnum([OrderStatus.PROCESSING, OrderStatus.COMPLETED], {
    message: 'Kitchen can only advance to PROCESSING or COMPLETED',
  })
  status: OrderStatus.PROCESSING | OrderStatus.COMPLETED;
}
