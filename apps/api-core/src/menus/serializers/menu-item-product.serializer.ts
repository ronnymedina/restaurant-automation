import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { fromCents } from '../../common/helpers/money';

@Exclude()
export class MenuItemProductSerializer {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Lomo al trapo' })
  @Expose()
  name: string;

  @ApiProperty({ example: 12.5, description: 'Precio en pesos (decimal)' })
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
  price: number;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://cdn.example.com/img.jpg' })
  @Expose()
  imageUrl: string | null;

  @ApiProperty({ example: true })
  @Expose()
  active: boolean;

  constructor(partial: { id: string; name: string; price: bigint | number; imageUrl: string | null; active: boolean }) {
    Object.assign(this, partial);
  }
}
