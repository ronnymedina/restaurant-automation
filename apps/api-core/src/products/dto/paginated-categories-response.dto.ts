import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { CategoryDto } from './category.dto';

export class PaginatedCategoriesResponseDto {
  @ApiProperty({ type: [CategoryDto] }) data: CategoryDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}
