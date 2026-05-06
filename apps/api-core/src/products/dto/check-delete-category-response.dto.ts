import { ApiProperty } from '@nestjs/swagger';

export class CheckDeleteCategoryResponseDto {
  @ApiProperty({ description: 'Number of products assigned to this category' })
  productsCount: number;

  @ApiProperty({
    description: 'True when productsCount is 0 — delete requires no extra steps',
  })
  canDeleteDirectly: boolean;
}
