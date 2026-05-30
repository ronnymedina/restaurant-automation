import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { fromCents } from '../../common/helpers/money';

@Exclude()
class OrderItemProductSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ description: 'Precio en pesos' })
  @Expose()
  price: number;

  constructor(partial: { id: string; name: string; price: bigint | number }) {
    this.id = partial.id;
    this.name = partial.name;
    this.price =
      typeof partial.price === 'bigint' || typeof partial.price === 'number'
        ? fromCents(partial.price)
        : (partial.price as unknown as number);
  }
}

@Exclude()
class OrderItemMenuItemSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiPropertyOptional({ description: 'Precio override en pesos' })
  @Expose()
  priceOverride: number | null;

  constructor(partial: { id: string; priceOverride: bigint | number | null }) {
    this.id = partial.id;
    this.priceOverride =
      partial.priceOverride === null || partial.priceOverride === undefined
        ? null
        : fromCents(partial.priceOverride as bigint | number);
  }
}

@Exclude()
export class OrderItemSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty({ description: 'Precio unitario en pesos' })
  @Expose()
  unitPrice: number;

  @ApiProperty({ description: 'Subtotal en pesos' })
  @Expose()
  subtotal: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  notes: string | null;

  @ApiPropertyOptional({ type: OrderItemProductSerializer, nullable: true })
  @Expose()
  @Type(() => OrderItemProductSerializer)
  product: OrderItemProductSerializer | null;

  @ApiPropertyOptional({ type: OrderItemMenuItemSerializer, nullable: true })
  @Expose()
  @Type(() => OrderItemMenuItemSerializer)
  menuItem: OrderItemMenuItemSerializer | null;

  constructor(partial: any) {
    this.id = partial.id;
    this.quantity = partial.quantity;
    this.unitPrice =
      typeof partial.unitPrice === 'bigint' || typeof partial.unitPrice === 'number'
        ? fromCents(partial.unitPrice)
        : partial.unitPrice;
    this.subtotal =
      typeof partial.subtotal === 'bigint' || typeof partial.subtotal === 'number'
        ? fromCents(partial.subtotal)
        : partial.subtotal;
    this.notes = partial.notes ?? null;
    this.product = partial.product ? new OrderItemProductSerializer(partial.product) : null;
    this.menuItem = partial.menuItem ? new OrderItemMenuItemSerializer(partial.menuItem) : null;
  }
}
