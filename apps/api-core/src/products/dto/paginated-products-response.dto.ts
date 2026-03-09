import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { ProductDto } from './product.dto';

export class PaginatedProductsResponseDto {
  @ApiProperty({ type: [ProductDto] }) data: ProductDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}
