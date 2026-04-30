import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ProductQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Buscar por nombre o SKU (máx. 100 caracteres)',
    example: 'hamburguesa',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
