import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecoverDto {
  @ApiProperty({ example: 'owner@restaurant.com' })
  @IsEmail()
  email: string;
}
