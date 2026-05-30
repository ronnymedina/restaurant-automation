import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '@prisma/client';

import { fromCents } from '../../common/helpers/money';
import { OrderItemSerializer } from './order-item.serializer';

@Exclude()
export class OrderSerializer {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() orderNumber: number;
  @ApiProperty() @Expose() restaurantId: string;
  @ApiProperty() @Expose() cashShiftId: string;
  @ApiProperty({ enum: OrderStatus }) @Expose() status: OrderStatus;

  @ApiProperty({ description: 'Total en pesos' })
  @Expose()
  totalAmount: number;

  @ApiPropertyOptional({ enum: PaymentMethod, nullable: true }) @Expose() paymentMethod: PaymentMethod | null;
  @ApiProperty() @Expose() isPaid: boolean;
  @ApiPropertyOptional({ nullable: true }) @Expose() customerEmail: string | null;
  @ApiPropertyOptional({ nullable: true }) @Expose() customerName: string | null;
  @ApiPropertyOptional({ nullable: true }) @Expose() customerPhone: string | null;
  @ApiPropertyOptional({ nullable: true }) @Expose() deliveryAddress: string | null;
  @ApiPropertyOptional({ nullable: true }) @Expose() deliveryReferences: string | null;
  @ApiPropertyOptional({ nullable: true }) @Expose() cancellationReason: string | null;
  @ApiProperty() @Expose() orderSource: string;
  @ApiProperty() @Expose() orderType: string;
  @ApiPropertyOptional({ nullable: true }) @Expose() tableNumber: string | null;
  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;

  @ApiProperty({ type: [OrderItemSerializer] })
  @Expose()
  @Type(() => OrderItemSerializer)
  items: OrderItemSerializer[];

  constructor(partial: any) {
    this.id = partial.id;
    this.orderNumber = partial.orderNumber;
    this.restaurantId = partial.restaurantId;
    this.cashShiftId = partial.cashShiftId;
    this.status = partial.status;
    this.totalAmount =
      typeof partial.totalAmount === 'bigint' || typeof partial.totalAmount === 'number'
        ? fromCents(partial.totalAmount)
        : partial.totalAmount;
    this.paymentMethod = partial.paymentMethod ?? null;
    this.isPaid = partial.isPaid;
    this.customerEmail = partial.customerEmail ?? null;
    this.customerName = partial.customerName ?? null;
    this.customerPhone = partial.customerPhone ?? null;
    this.deliveryAddress = partial.deliveryAddress ?? null;
    this.deliveryReferences = partial.deliveryReferences ?? null;
    this.cancellationReason = partial.cancellationReason ?? null;
    this.orderSource = partial.orderSource;
    this.orderType = partial.orderType;
    this.tableNumber = partial.tableNumber ?? null;
    this.createdAt = partial.createdAt;
    this.updatedAt = partial.updatedAt;
    this.items = Array.isArray(partial.items)
      ? partial.items.map((i: unknown) => new OrderItemSerializer(i as any))
      : [];
  }
}
