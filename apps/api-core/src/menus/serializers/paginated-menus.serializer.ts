import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { MenuListSerializer } from './menu-list.serializer';

export class PaginatedMenusSerializer {
  @ApiProperty({ type: [MenuListSerializer] })
  @Type(() => MenuListSerializer)
  data: MenuListSerializer[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  constructor(partial: Partial<PaginatedMenusSerializer>) {
    Object.assign(this, partial);
  }
}
