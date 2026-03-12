import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';

import { KitchenService } from './kitchen.service';
import { KitchenTokenGuard, KITCHEN_RESTAURANT_KEY } from './guards/kitchen-token.guard';
import { UpdateKitchenStatusDto } from './dto/update-kitchen-status.dto';
import { CancelKitchenOrderDto } from './dto/cancel-kitchen-order.dto';
import { GenerateKitchenTokenDto } from './dto/generate-kitchen-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'kitchen' })
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  // ADMIN: get current kitchen token info
  @Get('token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getToken(@Req() req: Request) {
    const user = (req as any).user;
    return this.kitchenService.getTokenInfo(user.restaurantId);
  }

  // ADMIN: generate/renew kitchen token
  @Post('token/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async generateToken(@Req() req: Request, @Body() dto: GenerateKitchenTokenDto) {
    const user = (req as any).user;
    return this.kitchenService.generateToken(user.restaurantId, dto.expiresAt);
  }

  // Kitchen display: token-authenticated endpoints
  @Get(':slug/orders')
  @UseGuards(KitchenTokenGuard)
  async getActiveOrders(@Req() req: Request) {
    return this.kitchenService.getActiveOrders((req as any)[KITCHEN_RESTAURANT_KEY]);
  }

  @Patch(':slug/orders/:id/status')
  @UseGuards(KitchenTokenGuard)
  async advanceStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
  ) {
    return this.kitchenService.advanceStatus((req as any)[KITCHEN_RESTAURANT_KEY], id, dto.status);
  }

  @Patch(':slug/orders/:id/cancel')
  @UseGuards(KitchenTokenGuard)
  async cancelOrder(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CancelKitchenOrderDto,
  ) {
    return this.kitchenService.cancelOrder((req as any)[KITCHEN_RESTAURANT_KEY], id, dto.reason);
  }

  @Post(':slug/notify-offline')
  @UseGuards(KitchenTokenGuard)
  async notifyOffline(@Req() req: Request) {
    await this.kitchenService.notifyOffline((req as any)[KITCHEN_RESTAURANT_KEY]);
    return { notified: true };
  }
}
