import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { MenusService } from './menus.service';
import { CreateMenuDto, UpdateMenuDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MenuSerializer } from './serializers/menu.serializer';
import { MenuListSerializer } from './serializers/menu-list.serializer';
import { MenuWithItemsSerializer } from './serializers/menu-with-items.serializer';

@ApiTags('menus')
@ApiBearerAuth()
@Controller({ version: '1', path: 'menus' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar menús del restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de menús', type: [MenuListSerializer] })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async listMenus(@CurrentUser() user: { restaurantId: string }) {
    const menus = await this.menusService.findByRestaurantId(user.restaurantId);
    return menus.map(menu => new MenuListSerializer(menu));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Obtener menú por ID con sus items' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Menú con items', type: MenuWithItemsSerializer })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getMenu(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    const menu = await this.menusService.findByIdWithItems(id, user.restaurantId);
    return new MenuWithItemsSerializer(menu);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Crear un menú' })
  @ApiResponse({ status: 201, description: 'Menú creado', type: MenuSerializer })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateMenuDto,
  ) {
    const menu = await this.menusService.createMenu(user.restaurantId, dto);
    return new MenuSerializer(menu);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Actualizar un menú' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Menú actualizado', type: MenuSerializer })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateMenuDto,
  ) {
    const menu = await this.menusService.updateMenu(id, user.restaurantId, dto);
    return new MenuSerializer(menu);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un menú (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 204, description: 'Menú eliminado' })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    await this.menusService.deleteMenu(id, user.restaurantId);
  }
}
