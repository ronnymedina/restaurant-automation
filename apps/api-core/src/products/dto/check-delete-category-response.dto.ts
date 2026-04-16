import { ApiProperty } from '@nestjs/swagger';

export class CheckDeleteCategoryResponseDto {
  @ApiProperty({ description: 'Number of products assigned to this category' })
  productsCount: number;

  @ApiProperty({ description: 'Whether this is the restaurant default category' })
  isDefault: boolean;

  @ApiProperty({
    description:
      'True when productsCount is 0 and category is not default — delete requires no extra steps',
  })
  canDeleteDirectly: boolean;
}
