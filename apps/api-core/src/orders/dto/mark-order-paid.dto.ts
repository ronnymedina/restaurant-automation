import { IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class MarkOrderPaidDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
