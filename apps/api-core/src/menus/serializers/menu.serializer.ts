import { Exclude, Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class MenuSerializer {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'Almuerzo Ejecutivo' })
  @Expose()
  name: string;

  @ApiProperty({ example: true })
  @Expose()
  active: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, example: '12:00' })
  @Expose()
  startTime: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '15:00' })
  @Expose()
  endTime: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'MON,TUE,WED,THU,FRI' })
  @Expose()
  daysOfWeek: string | null;

  constructor(partial: Partial<MenuSerializer>) {
    Object.assign(this, partial);
  }
}
