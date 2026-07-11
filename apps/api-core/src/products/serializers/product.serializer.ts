import { Product } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';
import { fromCents } from '../../common/helpers/money';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class ProductSerializer implements Omit<Product, 'price' | 'updatedAt' | 'deletedAt'> {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  description: string | null;

  @Transform(({ value }) => fromCents(value as bigint | number))
  @ApiProperty()
  @Expose()
  price: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @Expose()
  stock: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  sku: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  imageUrl: string | null;

  @ApiProperty()
  @Expose()
  active: boolean;

  @ApiProperty()
  @Expose()
  categoryId: string;

  @ApiProperty()
  @Expose()
  restaurantId: string;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  constructor(partial: Partial<Product>) {
    Object.assign(this, partial);
  }
}
