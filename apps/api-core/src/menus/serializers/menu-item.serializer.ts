import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuItemProductSerializer } from './menu-item-product.serializer';

@Exclude()
export class MenuItemSerializer {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @Expose()
  id: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Carnes' })
  @Expose()
  sectionName: string | null;

  @ApiProperty({ example: 0 })
  @Expose()
  order: number;

  @ApiProperty({ type: () => MenuItemProductSerializer })
  @Expose()
  @Type(() => MenuItemProductSerializer)
  product: MenuItemProductSerializer;

  constructor(partial: { id: string; sectionName?: string | null; order: number; product: { id: string; name: string; price: bigint | number; imageUrl: string | null; active: boolean } }) {
    Object.assign(this, partial);
    this.product = new MenuItemProductSerializer(partial.product);
  }
}
