import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'uuid-refresh-token', description: 'The refresh token issued at login or last refresh' })
  @IsString()
  refreshToken: string;
}
