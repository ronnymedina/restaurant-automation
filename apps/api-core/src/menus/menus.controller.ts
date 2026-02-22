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

import { MenusService } from './menus.service';
import { CreateMenuDto, UpdateMenuDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'menus' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  async findAll(@CurrentUser() user: { restaurantId: string }) {
    return this.menusService.findByRestaurantId(user.restaurantId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.menusService.findByIdWithItems(id, user.restaurantId);
  }

  @Post()
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateMenuDto,
  ) {
    return this.menusService.createMenu(user.restaurantId, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menusService.updateMenu(id, user.restaurantId, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.menusService.deleteMenu(id, user.restaurantId);
  }
}
