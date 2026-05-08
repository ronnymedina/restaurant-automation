import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendActivationDto {
  @ApiProperty({ description: 'Email de la cuenta a activar', example: 'usuario@restaurante.com' })
  @IsEmail({}, { message: 'El email debe ser válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;
}
