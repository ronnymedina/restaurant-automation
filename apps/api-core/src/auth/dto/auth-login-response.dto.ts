import { ApiProperty } from '@nestjs/swagger';

export class AuthLoginResponseDto {
  @ApiProperty({ example: 'America/Lima', description: 'Restaurant timezone, used by the frontend to format dates' })
  timezone: string;
}
