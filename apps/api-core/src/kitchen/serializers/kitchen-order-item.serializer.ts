import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { fromCents } from '../../common/helpers/money';

@Exclude()
class KitchenProductSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  imageUrl: string | null;

  constructor(partial: { id: string; name: string; imageUrl: string | null }) {
    this.id = partial.id;
    this.name = partial.name;
    this.imageUrl = partial.imageUrl ?? null;
  }
}

@Exclude()
export class KitchenOrderItemSerializer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty({ description: 'Precio unitario en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  unitPrice: number;

  @ApiProperty({ description: 'Subtotal en pesos' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  subtotal: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  notes: string | null;

  @ApiProperty({ type: KitchenProductSerializer })
  @Expose()
  @Type(() => KitchenProductSerializer)
  product: KitchenProductSerializer;

  constructor(partial: any) {
    this.id = partial.id;
    this.quantity = partial.quantity;
    this.unitPrice = partial.unitPrice;
    this.subtotal = partial.subtotal;
    this.notes = partial.notes ?? null;
    this.product = partial.product
      ? new KitchenProductSerializer(partial.product)
      : (undefined as any);
  }
}
