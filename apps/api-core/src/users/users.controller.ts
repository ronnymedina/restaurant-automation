import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { UsersService } from './users.service';
import { PendingOperationsService } from '../pending-operations/pending-operations.service';
import {
  ActivateUserDto,
  ActivateUserResponseDto,
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  PaginatedUsersResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Users')
@Controller({ version: '1', path: 'users' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly pendingOperationsService: PendingOperationsService,
  ) { }

  @Put('activate')
  @ApiOperation({
    summary: 'Activar cuenta de usuario',
    description:
      'Activa una cuenta usando el token de activación y establece la contraseña',
  })
  @ApiBody({ type: ActivateUserDto })
  @ApiResponse({
    status: 200,
    description: 'Cuenta activada exitosamente',
    type: ActivateUserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado, o datos de entrada no válidos' })
  @ApiResponse({ status: 409, description: 'La cuenta ya está activa' })
  async activate(@Body() body: ActivateUserDto): Promise<ActivateUserResponseDto> {
    const user = await this.usersService.activateUser(
      body.token,
      body.password,
    );
    return {
      email: user.email,
    };
  }

  @Get('confirm/:token')
  @ApiOperation({ summary: 'Confirmar operación pendiente por token de email' })
  @ApiParam({ name: 'token', description: 'Token de confirmación recibido por email' })
  @ApiResponse({ status: 200, description: 'Operación confirmada exitosamente' })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado o ya confirmado' })
  async confirmOperation(@Param('token') token: string) {
    return this.pendingOperationsService.confirmOperation(token);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear usuario (solo ADMIN) — requiere confirmación por email' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Solicitud enviada. Revisa tu correo para confirmar.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada no válidos o rol no permitido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN puede crear usuarios' })
  @ApiResponse({ status: 409, description: 'El email ya existe' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: { restaurantId: string; email: string },
  ) {
    return this.pendingOperationsService.requestCreateUser(
      user.email,
      user.restaurantId,
      { email: dto.email, password: dto.password, role: dto.role },
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar usuarios del restaurante (ADMIN y MANAGER)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página (comienza en 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Registros por página (máximo 100)', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuarios del restaurante',
    type: PaginatedUsersResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN o MANAGER pueden listar usuarios' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.usersService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar usuario (solo ADMIN) — cambio de rol requiere confirmación por email' })
  @ApiParam({ name: 'id', description: 'ID del usuario a editar', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'Usuario actualizado, o solicitud enviada por email si incluye cambio de rol' })
  @ApiResponse({ status: 400, description: 'Datos de entrada no válidos o rol no permitido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN puede editar usuarios, o el usuario pertenece a otro restaurante' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string; email: string },
    @Body() dto: UpdateUserDto,
  ) {
    if (dto.role !== undefined) {
      return this.pendingOperationsService.requestUpdateUserRole(
        user.email,
        user.restaurantId,
        id,
        dto.role,
      );
    }
    return this.usersService.updateUser(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar usuario (solo ADMIN) — requiere confirmación por email' })
  @ApiParam({ name: 'id', description: 'ID del usuario a eliminar', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({ status: 200, description: 'Solicitud enviada. Revisa tu correo para confirmar.' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN puede eliminar usuarios, o el usuario pertenece a otro restaurante' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string; email: string },
  ) {
    return this.pendingOperationsService.requestDeleteUser(
      user.email,
      user.restaurantId,
      id,
    );
  }
}
