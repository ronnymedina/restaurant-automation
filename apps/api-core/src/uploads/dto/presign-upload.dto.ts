import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignUploadDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimetype: 'image/jpeg' | 'image/png' | 'image/webp';
}
