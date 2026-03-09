import { ApiProperty } from '@nestjs/swagger';

export class ActivateUserResponseDto {
  @ApiProperty({
    description: 'Email de la cuenta activada',
    example: 'empleado@restaurante.com',
  })
  email: string;
}
