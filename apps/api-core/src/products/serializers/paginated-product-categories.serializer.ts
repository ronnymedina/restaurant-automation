import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { ProductCategorySerializer } from './product-category.serializer';

export class PaginatedProductCategoriesSerializer {
  @ApiProperty({ type: [ProductCategorySerializer] })
  @Type(() => ProductCategorySerializer)
  data: ProductCategorySerializer[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  constructor(partial: Partial<PaginatedProductCategoriesSerializer>) {
    Object.assign(this, partial);
  }
}
