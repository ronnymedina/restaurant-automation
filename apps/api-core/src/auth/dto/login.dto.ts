import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', description: 'The user email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'supersecret', description: 'The user password (min 8 characters)', minLength: 8 })
  @MinLength(8)
  password: string;
}
