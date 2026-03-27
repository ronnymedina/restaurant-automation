import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { ProductListSerializer } from './product-list.serializer';

export class PaginatedProductsSerializer {
  @ApiProperty({ type: [ProductListSerializer] })
  @Type(() => ProductListSerializer)
  data: ProductListSerializer[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  constructor(partial: Partial<PaginatedProductsSerializer>) {
    Object.assign(this, partial);
  }
}
