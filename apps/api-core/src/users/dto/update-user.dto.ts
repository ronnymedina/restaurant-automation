import { IsOptional, IsEmail, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Nuevo email del usuario',
    example: 'nuevo@restaurante.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Nuevo rol del usuario (no puede ser ADMIN)',
    enum: Role,
    example: Role.BASIC,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Estado de activación del usuario',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
