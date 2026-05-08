import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Exclude()
export class KitchenGeneratedTokenSerializer {
  @ApiProperty()
  @Expose()
  token: string;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  expiresAt: Date;

  @ApiProperty()
  @Expose()
  kitchenUrl: string;

  constructor(partial: Partial<KitchenGeneratedTokenSerializer>) {
    Object.assign(this, partial);
  }
}
