import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { KioskService } from './kiosk.service';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { OrderRepository } from '../orders/order.repository';
import { EntityNotFoundException } from '../common/exceptions';
import {
  KioskStatusDto,
  KioskMenuDto,
  KioskMenuItemsResponseDto,
  KioskOrderStatusDto,
} from './dto/kiosk-response.dto';
import { OrderWithItemsDto } from '../orders/dto/order.dto';

@ApiTags('kiosk')
@Controller({ version: '1', path: 'kiosk' })
export class KioskController {
  constructor(
    private readonly kioskService: KioskService,
    private readonly orderRepository: OrderRepository,
  ) {}

  @Get(':slug/status')
  @ApiOperation({ summary: 'Verificar si el kiosk está operativo (caja abierta)' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiResponse({ status: 200, description: 'Estado del kiosk', type: KioskStatusDto })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  async getStatus(@Param('slug') slug: string) {
    return this.kioskService.getStatus(slug);
  }

  @Get(':slug/menus')
  @ApiOperation({ summary: 'Obtener menús disponibles en el horario actual' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiResponse({ status: 200, description: 'Lista de menús activos y disponibles', type: [KioskMenuDto] })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  async getMenus(@Param('slug') slug: string) {
    return this.kioskService.getAvailableMenus(slug);
  }

  @Get(':slug/menus/:menuId/items')
  @ApiOperation({ summary: 'Obtener items de un menú agrupados por sección' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiParam({ name: 'menuId', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Items del menú agrupados por sección', type: KioskMenuItemsResponseDto })
  @ApiResponse({ status: 404, description: 'Restaurante o menú no encontrado' })
  async getMenuItems(
    @Param('slug') slug: string,
    @Param('menuId') menuId: string,
  ) {
    return this.kioskService.getMenuItems(slug, menuId);
  }

  @Post(':slug/orders')
  @ApiOperation({ summary: 'Crear una orden desde el kiosk' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente', type: OrderWithItemsDto })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  @ApiResponse({ status: 409, description: 'No hay caja registradora abierta' })
  async createOrder(@Param('slug') slug: string, @Body() dto: CreateOrderDto) {
    return this.kioskService.createKioskOrder(slug, dto);
  }

  @Get(':slug/orders/:orderId')
  @ApiOperation({ summary: 'Consultar estado de una orden' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiParam({ name: 'orderId', description: 'ID de la orden', type: String })
  @ApiResponse({ status: 200, description: 'Estado actual de la orden', type: KioskOrderStatusDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  async getOrderStatus(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
  ) {
    await this.kioskService.resolveRestaurant(slug);
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);
    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      items: orderWithItems.items,
      createdAt: order.createdAt,
    };
  }
}
