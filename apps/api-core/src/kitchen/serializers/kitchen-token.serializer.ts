import { Exclude, Expose } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class KitchenTokenSerializer {
  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  kitchenUrl: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @Expose()
  expiresAt: Date | null;

  constructor(partial: Partial<KitchenTokenSerializer>) {
    Object.assign(this, partial);
  }
}
