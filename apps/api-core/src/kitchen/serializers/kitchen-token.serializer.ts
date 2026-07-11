import { Exclude, Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class KitchenTokenSerializer {
  @ApiProperty({ type: Boolean })
  @Expose()
  hasToken: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @Expose()
  expiresAt: Date | null;

  constructor(partial: Partial<KitchenTokenSerializer>) {
    Object.assign(this, partial);
  }
}
