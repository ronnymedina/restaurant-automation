import {
  Controller, Get, Patch, Param, Query, Body, UseGuards, ParseIntPipe, ParseEnumPipe,
} from '@nestjs/common';
import { Role, OrderStatus } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrderDto, OrderWithItemsDto } from './dto/order.dto';
import { TimezoneService } from '../restaurants/timezone.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ version: '1', path: 'orders' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar órdenes del restaurante' })
  @ApiQuery({ name: 'cashShiftId', required: false, type: String, description: 'Filtrar por sesión de caja' })
  @ApiQuery({ name: 'orderNumber', required: false, type: Number, description: 'Filtrar por número de orden (coincidencia exacta)' })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus, description: 'Filtrar por estado' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máximo de registros (default 30, max 30)' })
  @ApiResponse({ status: 200, description: 'Lista de órdenes', type: [OrderDto] })
  @ApiResponse({ status: 400, description: 'Parámetro inválido (status o orderNumber)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query('cashShiftId') cashShiftId?: string,
    @Query('orderNumber', new ParseIntPipe({ optional: true })) orderNumber?: number,
    @Query('status', new ParseEnumPipe(OrderStatus, { optional: true })) status?: OrderStatus,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Math.min(30, Math.max(1, parseInt(limit, 10) || 30)) : 30;
    const orders = await this.ordersService.findByRestaurantId(
      user.restaurantId, status, take, cashShiftId, orderNumber,
    );
    const tz = await this.timezoneService.getTimezone(user.restaurantId);
    return orders.map(o => ({
      ...o,
      displayTime: new Intl.DateTimeFormat('es', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(o.createdAt)),
    }));
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Historial de pedidos con filtros y paginación' })
  @ApiQuery({ name: 'orderNumber', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Fecha inicio YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Fecha fin YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findHistory(
    @CurrentUser() user: { restaurantId: string },
    @Query('orderNumber') orderNumber?: string,
    @Query('status') status?: OrderStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ordersService.findHistory(user.restaurantId, {
      orderNumber: orderNumber ? parseInt(orderNumber, 10) : undefined,
      status,
      dateFrom,
      dateTo,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Obtener orden por ID' })
  @ApiParam({ name: 'id', description: 'ID de la orden', type: String })
  @ApiResponse({ status: 200, description: 'Orden encontrada', type: OrderWithItemsDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.ordersService.findById(id, user.restaurantId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de la orden' })
  @ApiParam({ name: 'id', description: 'ID de la orden', type: String })
  @ApiResponse({ status: 200, description: 'Estado actualizado', type: OrderDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, user.restaurantId, dto.status);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Marcar orden como pagada' })
  @ApiParam({ name: 'id', description: 'ID de la orden', type: String })
  @ApiResponse({ status: 200, description: 'Orden marcada como pagada', type: OrderDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async markAsPaid(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.ordersService.markAsPaid(id, user.restaurantId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar una orden' })
  @ApiParam({ name: 'id', description: 'ID de la orden', type: String })
  @ApiResponse({ status: 200, description: 'Orden cancelada', type: OrderDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN o MANAGER)' })
  async cancelOrder(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(id, user.restaurantId, dto.reason);
  }
}
