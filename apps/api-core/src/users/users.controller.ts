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
  constructor(private readonly usersService: UsersService) {}

  @Put('activate')
  @ApiOperation({ summary: 'Activar cuenta de usuario' })
  @ApiBody({ type: ActivateUserDto })
  @ApiResponse({ status: 200, type: ActivateUserResponseDto })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 409, description: 'La cuenta ya está activa' })
  async activate(@Body() body: ActivateUserDto): Promise<ActivateUserResponseDto> {
    const user = await this.usersService.activateUser(body.token, body.password);
    return { email: user.email };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear usuario (solo ADMIN)' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos no válidos o rol no permitido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN puede crear usuarios' })
  @ApiResponse({ status: 409, description: 'El email ya existe' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.usersService.createUser(
      dto.email,
      dto.password,
      dto.role,
      user.restaurantId,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar usuarios del restaurante' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, type: PaginatedUsersResponseDto })
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
  @ApiOperation({ summary: 'Editar usuario (solo ADMIN)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos no válidos' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar usuario (solo ADMIN)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.usersService.deleteUser(id, user.restaurantId);
  }
}
