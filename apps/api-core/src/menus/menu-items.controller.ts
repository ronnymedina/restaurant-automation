import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { MenuItemsService } from './menu-items.service';
import { MenusService } from './menus.service';
import { CreateMenuItemDto, UpdateMenuItemDto, BulkCreateMenuItemsDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'menus/:menuId/items' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class MenuItemsController {
  constructor(
    private readonly menuItemsService: MenuItemsService,
    private readonly menusService: MenusService,
  ) {}

  @Post()
  async create(
    @Param('menuId') menuId: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateMenuItemDto,
  ) {
    await this.menusService.verifyOwnership(menuId, user.restaurantId);
    return this.menuItemsService.createItem(menuId, dto);
  }

  @Post('bulk')
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
  async update(
    @Param('menuId') menuId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateMenuItemDto,
  ) {
    await this.menusService.verifyOwnership(menuId, user.restaurantId);
    return this.menuItemsService.updateItem(itemId, dto);
  }

  @Delete(':itemId')
  async remove(
    @Param('menuId') menuId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    await this.menusService.verifyOwnership(menuId, user.restaurantId);
    return this.menuItemsService.deleteItem(itemId);
  }
}
