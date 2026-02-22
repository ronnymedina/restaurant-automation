import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { PrintService } from './print.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'print' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Get('receipt/:orderId')
  async getReceipt(@Param('orderId') orderId: string) {
    return this.printService.generateReceipt(orderId);
  }

  @Post('receipt/:orderId/print')
  async printReceipt(@Param('orderId') orderId: string) {
    return this.printService.printReceipt(orderId);
  }
}
