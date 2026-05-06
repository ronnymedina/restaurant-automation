import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty({ type: [KitchenOrderItemSerializer] })
  @Expose()
  @Type(() => KitchenOrderItemSerializer)
  items: KitchenOrderItemSerializer[];

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial.items) {
      this.items = (partial.items as any[]).map((item) => new KitchenOrderItemSerializer(item));
    }
  }
}
