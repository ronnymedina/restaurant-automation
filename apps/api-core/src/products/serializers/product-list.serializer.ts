import { Product } from '@prisma/client';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { fromCents } from '../../common/helpers/money';

@Exclude()
class CategoryNameSerializer {
  @ApiProperty()
  @Expose()
  name: string;

  constructor(partial: Partial<CategoryNameSerializer>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class ProductListSerializer implements Omit<Product, 'price' | 'updatedAt' | 'deletedAt'> {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  description: string | null;

  @ApiProperty()
  @Expose()
  @Transform(({ value }) => fromCents(value as bigint | number))
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

  @ApiProperty({ type: CategoryNameSerializer })
  @Expose()
  @Type(() => CategoryNameSerializer)
  category: CategoryNameSerializer;

  constructor(partial: Partial<Product & { category?: { name: string } }>) {
    Object.assign(this, partial);
    if (partial.category) {
      this.category = new CategoryNameSerializer(partial.category);
    }
  }
}
