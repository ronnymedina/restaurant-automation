import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'Short-lived JWT access token' })
  accessToken: string;

  @ApiProperty({ example: 'uuid-refresh-token', description: 'Long-lived opaque refresh token' })
  refreshToken: string;
}
