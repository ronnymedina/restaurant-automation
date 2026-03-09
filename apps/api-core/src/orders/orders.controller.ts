import {
  Controller, Get, Patch, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { Role, OrderStatus } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ version: '1', path: 'orders' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'List orders by restaurant' })
  @ApiResponse({ status: 200, description: 'List of orders' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findByRestaurantId(user.restaurantId, status);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.ordersService.findById(id, user.restaurantId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, user.restaurantId, dto.status);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark order as paid' })
  @ApiResponse({ status: 200, description: 'Order marked as paid' })
  async markAsPaid(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.ordersService.markAsPaid(id, user.restaurantId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiResponse({ status: 200, description: 'Order cancelled' })
  async cancelOrder(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(id, user.restaurantId, dto.reason);
  }
}
