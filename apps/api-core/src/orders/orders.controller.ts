import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Role, OrderStatus } from '@prisma/client';

import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'orders' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findByRestaurantId(user.restaurantId, status);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.ordersService.findById(id, user.restaurantId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(
      id,
      user.restaurantId,
      dto.status,
    );
  }
}
