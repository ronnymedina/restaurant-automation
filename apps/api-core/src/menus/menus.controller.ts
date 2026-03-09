import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { MenusService } from './menus.service';
import { CreateMenuDto, UpdateMenuDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MenuDto, MenuWithItemsDto } from './dto/menu.dto';

@ApiTags('menus')
@ApiBearerAuth()
@Controller({ version: '1', path: 'menus' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @ApiOperation({ summary: 'Listar menús del restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de menús', type: [MenuDto] })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere MANAGER)' })
  async findAll(@CurrentUser() user: { restaurantId: string }) {
    return this.menusService.findByRestaurantId(user.restaurantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener menú por ID con sus items' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Menú con items', type: MenuWithItemsDto })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.menusService.findByIdWithItems(id, user.restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un menú' })
  @ApiResponse({ status: 201, description: 'Menú creado', type: MenuDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere MANAGER)' })
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateMenuDto,
  ) {
    return this.menusService.createMenu(user.restaurantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un menú' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Menú actualizado', type: MenuDto })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere MANAGER)' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menusService.updateMenu(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un menú' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Menú eliminado', type: MenuDto })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere MANAGER)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.menusService.deleteMenu(id, user.restaurantId);
  }
}
