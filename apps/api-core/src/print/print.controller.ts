import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { PrintService } from './print.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'print' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Get('kitchen-ticket/:orderId')
  async getKitchenTicket(@Param('orderId') orderId: string) {
    return this.printService.generateKitchenTicket(orderId);
  }

  @Post('kitchen-ticket/:orderId/print')
  async printKitchenTicket(@Param('orderId') orderId: string) {
    return this.printService.printKitchenTicket(orderId);
  }
}
