import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteCategoryDto {
  @ApiPropertyOptional({
    description: 'ID of the category to reassign products to before deleting',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  reassignTo?: string;
}
