import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { fromCents } from '../../common/helpers/money';
import { KitchenOrderItemSerializer } from './kitchen-order-item.serializer';

@Exclude()
export class KitchenOrderSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  orderNumber: number;

  @ApiProperty({ enum: OrderStatus })
  @Expose()
  status: OrderStatus;

  @ApiProperty({ description: 'Total en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  totalAmount: number;

  @ApiProperty({ description: 'HH:MM en el timezone del restaurante' })
  @Expose()
  displayTime: string;

  @ApiProperty({ type: [KitchenOrderItemSerializer] })
  @Expose()
  @Type(() => KitchenOrderItemSerializer)
  items: KitchenOrderItemSerializer[];

  @ApiProperty()
  @Expose()
  orderType: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  tableNumber: string | null;

  constructor(partial: any, timezone = 'UTC') {
    this.id = partial.id;
    this.orderNumber = partial.orderNumber;
    this.status = partial.status;
    this.totalAmount = partial.totalAmount;
    this.orderType = partial.orderType;
    this.tableNumber = partial.tableNumber ?? null;
    this.items = Array.isArray(partial.items)
      ? partial.items.map((item: unknown) => new KitchenOrderItemSerializer(item as any))
      : [];
    this.displayTime = formatKitchenTime(partial.createdAt, timezone);
  }
}

function formatKitchenTime(createdAt: Date | string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(createdAt));
  } catch {
    return new Intl.DateTimeFormat('es', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(createdAt));
  }
}
