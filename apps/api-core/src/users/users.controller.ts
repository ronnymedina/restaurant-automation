import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { UsersService } from './users.service';
import { ActivateUserDto, CreateUserDto, UpdateUserDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Users')
@Controller({ version: '1', path: 'users' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put('activate')
  @ApiOperation({
    summary: 'Activar cuenta de usuario',
    description:
      'Activa una cuenta usando el token de activación y establece la contraseña',
  })
  @ApiResponse({ status: 200, description: 'Cuenta activada exitosamente' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 409, description: 'La cuenta ya está activa' })
  async activate(@Body() body: ActivateUserDto) {
    const user = await this.usersService.activateUser(body.token, body.password);
    return {
      message: 'Cuenta activada exitosamente',
      userId: user.id,
      email: user.email,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Crear usuario (solo MANAGER)' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 403, description: 'Solo MANAGER puede crear usuarios' })
  @ApiResponse({ status: 409, description: 'Email ya existe' })
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
  async findAll(@CurrentUser() user: { restaurantId: string }) {
    return this.usersService.findByRestaurantId(user.restaurantId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.usersService.deleteUser(id, user.restaurantId);
  }
}
