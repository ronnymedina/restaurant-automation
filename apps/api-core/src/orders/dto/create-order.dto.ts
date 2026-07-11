import {
  IsArray,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  IsEnum,
  IsEmail,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { toCents } from '../../common/helpers/money';
import { IsBigInt, MinBigInt } from '../../common/decorators/is-bigint.decorator';

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
  @MaxLength(500)
  notes?: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'cliente@email.com' })
  @IsEmail()
  @IsOptional()
  @MaxLength(254)
  customerEmail?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Nombre del cliente' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  customerName?: string;

  @ApiPropertyOptional({ example: '+52 555 1234567', description: 'Teléfono del cliente' })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'Calle Reforma 123, Col. Centro' })
  // No @IsOptional() — intentionally required (non-empty) when orderType === 'DELIVERY'
  @ValidateIf((o) => o.orderType === 'DELIVERY')
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  deliveryAddress?: string;

  @ApiPropertyOptional({ example: 'Puerta azul, 2do piso' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  deliveryReferences?: string;

  @ApiPropertyOptional({
    example: 25.0,
    description: 'Total esperado en pesos para validación (se convierte a BigInt centavos internamente)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? toCents(value) : value))
  @IsBigInt()
  @MinBigInt(0n, { message: 'expectedTotal no puede ser negativo' })
  expectedTotal?: bigint;

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
  @MaxLength(20)
  tableNumber?: string;
}
