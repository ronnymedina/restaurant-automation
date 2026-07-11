import { Exclude, Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class CreateMenuItemSerializer {
  @ApiProperty({ example: 'fb608571-c5e4-4f0b-a409-c42f147caad3' })
  @Expose()
  menuId: string;

  @ApiProperty({ example: '388cea2b-78a0-4aab-a80d-5ffe766b6de7' })
  @Expose()
  productId: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Para Empezar' })
  @Expose()
  sectionName: string | null;

  @ApiProperty({ example: 1 })
  @Expose()
  order: number;

  constructor(partial: { menuId: string; productId: string; sectionName?: string | null; order: number }) {
    Object.assign(this, partial);
  }
}
