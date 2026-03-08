import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({
    description: 'ID único del usuario',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Email del usuario',
    example: 'empleado@restaurante.com',
  })
  email: string;

  @ApiProperty({
    description: 'Rol del usuario',
    enum: Role,
    example: Role.MANAGER,
  })
  role: Role;

  @ApiProperty({
    description: 'Indica si la cuenta está activa',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'ID del restaurante al que pertenece el usuario',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  restaurantId: string;

  @ApiProperty({
    description: 'Fecha de creación del usuario',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Fecha de última actualización del usuario',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;
}
