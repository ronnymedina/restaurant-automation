import { IsEnum } from 'class-validator';
import { $Enums } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { KITCHEN_ALLOWED_TARGETS } from '../../orders/order-state-machine';

export class UpdateKitchenStatusDto {
  @ApiProperty({
    enum: KITCHEN_ALLOWED_TARGETS,
    description: 'Nuevo estado del pedido (solo PROCESSING o SERVED desde cocina)',
  })
  @IsEnum(KITCHEN_ALLOWED_TARGETS, {
    message: `Kitchen can only advance to ${KITCHEN_ALLOWED_TARGETS.join(' or ')}`,
  })
  status: $Enums.OrderStatus;
}
