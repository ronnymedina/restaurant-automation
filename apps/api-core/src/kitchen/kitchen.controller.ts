import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiSecurity,
} from '@nestjs/swagger';

import { KitchenService } from './kitchen.service';
import { KitchenTokenGuard, KITCHEN_RESTAURANT_KEY } from './guards/kitchen-token.guard';
import { UpdateKitchenStatusDto } from './dto/update-kitchen-status.dto';
import { CancelKitchenOrderDto } from './dto/cancel-kitchen-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { KitchenTokenSerializer } from './serializers/kitchen-token.serializer';
import { KitchenGeneratedTokenSerializer } from './serializers/kitchen-generated-token.serializer';
import { KitchenOrderSerializer } from './serializers/kitchen-order.serializer';

@ApiTags('kitchen')
@Controller({ version: '1', path: 'kitchen' })
@UseInterceptors(ClassSerializerInterceptor)
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener información del token de cocina actual' })
  @ApiResponse({ status: 200, description: 'Información del token', type: KitchenTokenSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN)' })
  async getToken(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.kitchenService.getTokenInfo(user.restaurantId);
    return new KitchenTokenSerializer(data);
  }

  @Post('token/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generar o renovar token de acceso para la pantalla de cocina' })
  @ApiResponse({ status: 201, description: 'Token generado', type: KitchenGeneratedTokenSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN)' })
  async generateToken(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.kitchenService.generateToken(user.restaurantId);
    return new KitchenGeneratedTokenSerializer(data);
  }

  @Get(':slug/orders')
  @UseGuards(KitchenTokenGuard)
  @ApiSecurity('kitchen-token')
  @ApiOperation({ summary: 'Listar pedidos activos (CREATED y PROCESSING) para la pantalla de cocina' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiQuery({ name: 'token', required: true, description: 'Token de acceso de cocina' })
  @ApiResponse({ status: 200, description: 'Lista de pedidos activos', type: [KitchenOrderSerializer] })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async getActiveOrders(@Req() req: Request) {
    const orders = await this.kitchenService.getActiveOrders((req as any)[KITCHEN_RESTAURANT_KEY]);
    return orders.map((order) => new KitchenOrderSerializer(order));
  }

  @Patch(':slug/orders/:id/status')
  @UseGuards(KitchenTokenGuard)
  @ApiSecurity('kitchen-token')
  @ApiOperation({ summary: 'Avanzar estado de un pedido (CREATED → PROCESSING → COMPLETED)' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiParam({ name: 'id', description: 'ID del pedido', type: String })
  @ApiQuery({ name: 'token', required: true, description: 'Token de acceso de cocina' })
  @ApiResponse({ status: 200, description: 'Estado actualizado', type: KitchenOrderSerializer })
  @ApiResponse({ status: 400, description: 'Transición de estado inválida' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async advanceStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
  ) {
    const order = await this.kitchenService.advanceStatus(
      (req as any)[KITCHEN_RESTAURANT_KEY],
      id,
      dto.status,
    );
    return new KitchenOrderSerializer(order);
  }

  @Patch(':slug/orders/:id/cancel')
  @UseGuards(KitchenTokenGuard)
  @ApiSecurity('kitchen-token')
  @ApiOperation({ summary: 'Cancelar un pedido desde la pantalla de cocina' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiParam({ name: 'id', description: 'ID del pedido', type: String })
  @ApiQuery({ name: 'token', required: true, description: 'Token de acceso de cocina' })
  @ApiResponse({ status: 200, description: 'Pedido cancelado', type: KitchenOrderSerializer })
  @ApiResponse({ status: 400, description: 'El pedido no puede cancelarse en su estado actual' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async cancelOrder(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CancelKitchenOrderDto,
  ) {
    const order = await this.kitchenService.cancelOrder(
      (req as any)[KITCHEN_RESTAURANT_KEY],
      id,
      dto.reason,
    );
    return new KitchenOrderSerializer(order);
  }

  @Post(':slug/notify-offline')
  @UseGuards(KitchenTokenGuard)
  @ApiSecurity('kitchen-token')
  @ApiOperation({ summary: 'Notificar al dashboard que la pantalla de cocina está offline' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiQuery({ name: 'token', required: true, description: 'Token de acceso de cocina' })
  @ApiResponse({ status: 201, description: 'Notificación emitida', schema: { example: { notified: true } } })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async notifyOffline(@Req() req: Request) {
    await this.kitchenService.notifyOffline((req as any)[KITCHEN_RESTAURANT_KEY]);
    return { notified: true };
  }
}
