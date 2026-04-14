import { ProductCategory } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Exclude()
export class ProductCategorySerializer implements Pick<ProductCategory, 'id' | 'name' | 'isDefault'> {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Bebidas' })
  @Expose()
  name: string;

  @ApiProperty({ example: false, description: 'Indicates if this is the restaurant default category. Default categories cannot be edited or deleted.' })
  @Expose()
  isDefault: boolean;

  constructor(partial: Partial<ProductCategory>) {
    Object.assign(this, partial);
  }
}
