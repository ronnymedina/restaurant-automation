import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'uuid-token-here' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewSecurePass123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
