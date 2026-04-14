import {
  Controller,
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

import { MenuItemsService } from './menu-items.service';
import { MenusService } from './menus.service';
import {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  BulkCreateMenuItemsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BulkCreateResultDto } from './dto/menu.dto';
import { MenuItemSerializer } from './serializers/menu-item.serializer';

@ApiTags('menu-items')
@ApiBearerAuth()
@Controller({ version: '1', path: 'menus/:menuId/items' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class MenuItemsController {
  constructor(
    private readonly menuItemsService: MenuItemsService,
    private readonly menusService: MenusService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Agregar un item al menú' })
  @ApiParam({ name: 'menuId', description: 'ID del menú', type: String })
  @ApiResponse({ status: 201, description: 'Item creado', type: MenuItemSerializer })
  @ApiResponse({ status: 404, description: 'Menú o producto no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async create(
    @Param('menuId') menuId: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateMenuItemDto,
  ) {
    await this.menusService.verifyOwnership(menuId, user.restaurantId);
    const item = await this.menuItemsService.createItem(menuId, user.restaurantId, dto);
    return new MenuItemSerializer(item);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Agregar múltiples productos al menú en lote' })
  @ApiParam({ name: 'menuId', description: 'ID del menú', type: String })
  @ApiResponse({ status: 201, description: 'Items creados en lote', type: BulkCreateResultDto })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere MANAGER)' })
  async bulkCreate(
    @Param('menuId') menuId: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: BulkCreateMenuItemsDto,
  ) {
    await this.menusService.verifyOwnership(menuId, user.restaurantId);
    const count = await this.menuItemsService.bulkCreateItems(
      menuId,
      dto.productIds,
      dto.sectionName,
    );
    return { created: count };
  }

  @Patch(':itemId')
  @ApiOperation({ summary: 'Actualizar un item del menú' })
  @ApiParam({ name: 'menuId', description: 'ID del menú', type: String })
  @ApiParam({ name: 'itemId', description: 'ID del item de menú', type: String })
  @ApiResponse({ status: 200, description: 'Item actualizado', type: MenuItemSerializer })
  @ApiResponse({ status: 404, description: 'Menú o item no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async update(
    @Param('menuId') menuId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateMenuItemDto,
  ) {
    await this.menusService.verifyOwnership(menuId, user.restaurantId);
    const item = await this.menuItemsService.updateItem(itemId, user.restaurantId, dto);
    return new MenuItemSerializer(item);
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un item del menú' })
  @ApiParam({ name: 'menuId', description: 'ID del menú', type: String })
  @ApiParam({ name: 'itemId', description: 'ID del item de menú', type: String })
  @ApiResponse({ status: 204, description: 'Item eliminado' })
  @ApiResponse({ status: 404, description: 'Menú o item no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async remove(
    @Param('menuId') menuId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    await this.menusService.verifyOwnership(menuId, user.restaurantId);
    await this.menuItemsService.deleteItem(itemId, user.restaurantId);
  }
}
