import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordResponseDto {
  @ApiProperty({ example: 'owner@restaurant.com' })
  email: string;
}
