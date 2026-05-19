import {
  IsArray,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsEnum,
  IsEmail,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderItemDto {
  @ApiProperty({ example: 'uuid-producto', description: 'ID del producto' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ example: 'uuid-menu-item', description: 'ID del item de menú (opcional)' })
  @IsString()
  @IsOptional()
  menuItemId?: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'Sin cebolla' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: 'cliente@email.com' })
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @ApiPropertyOptional({ example: '+52 555 1234567', description: 'Teléfono del cliente' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'Calle Reforma 123, Col. Centro' })
  // No @IsOptional() — intentionally required (non-empty) when orderType === 'DELIVERY'
  @ValidateIf((o) => o.orderType === 'DELIVERY')
  @IsString()
  @IsNotEmpty()
  deliveryAddress?: string;

  @ApiPropertyOptional({ example: 'Puerta azul, 2do piso' })
  @IsString()
  @IsOptional()
  deliveryReferences?: string;

  @ApiPropertyOptional({ example: 25.0, description: 'Total esperado para validación' })
  @IsNumber()
  @IsOptional()
  expectedTotal?: number;

  @ApiPropertyOptional({ example: 'STAFF', description: 'Origen del pedido: KIOSK | WEB | STAFF' })
  @IsString()
  @IsIn(['KIOSK', 'WEB', 'STAFF'])
  @IsOptional()
  orderSource?: string;

  @ApiPropertyOptional({ example: 'PICKUP', description: 'Tipo de entrega: PICKUP | DELIVERY | DINE_IN' })
  @IsString()
  @IsIn(['PICKUP', 'DELIVERY', 'DINE_IN'])
  @IsOptional()
  orderType?: string;

  @ApiPropertyOptional({ example: '5', description: 'Número de mesa. Requerido si orderType = DINE_IN' })
  @IsString()
  @IsOptional()
  tableNumber?: string;
}
