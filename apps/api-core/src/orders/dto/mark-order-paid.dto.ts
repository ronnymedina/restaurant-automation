import { IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkOrderPaidDto {
  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;
}
