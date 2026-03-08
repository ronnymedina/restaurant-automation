import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Total de registros', example: 42 })
  total: number;

  @ApiProperty({ description: 'Página actual', example: 1 })
  page: number;

  @ApiProperty({ description: 'Registros por página', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total de páginas', example: 3 })
  totalPages: number;
}

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto], description: 'Lista de usuarios' })
  data: UserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto, description: 'Metadatos de paginación' })
  meta: PaginationMetaDto;
}
