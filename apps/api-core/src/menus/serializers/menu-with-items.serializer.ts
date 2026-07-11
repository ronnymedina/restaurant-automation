import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuItemSerializer } from './menu-item.serializer';

@Exclude()
export class MenuWithItemsSerializer {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Almuerzo Ejecutivo' })
  @Expose()
  name: string;

  @ApiProperty({ example: true })
  @Expose()
  active: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, example: '12:00' })
  @Expose()
  startTime: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '15:00' })
  @Expose()
  endTime: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'MON,TUE,WED,THU,FRI' })
  @Expose()
  daysOfWeek: string | null;

  @ApiProperty({ type: [MenuItemSerializer] })
  @Expose()
  @Type(() => MenuItemSerializer)
  items: MenuItemSerializer[];

  constructor(partial: { id: string; name: string; active: boolean; startTime: string | null; endTime: string | null; daysOfWeek: string | null; items: Array<{ id: string; sectionName?: string | null; order: number; product: { id: string; name: string; price: bigint | number; imageUrl: string | null; active: boolean } }> }) {
    Object.assign(this, partial);
    this.items = partial.items.map(item => new MenuItemSerializer(item));
  }
}
