import { ApiProperty } from '@nestjs/swagger';

export class LogoutResponseDto {
  @ApiProperty({ example: 'Logged out successfully', description: 'Confirmation message' })
  message: string;
}
