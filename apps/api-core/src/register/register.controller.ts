import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { RegisterService } from './register.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'register' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class RegisterController {
  constructor(private readonly registerService: RegisterService) {}

  @Post('open')
  async open(@CurrentUser() user: { restaurantId: string }) {
    return this.registerService.openSession(user.restaurantId);
  }

  @Post('close')
  async close(@CurrentUser() user: { restaurantId: string; sub: string }) {
    return this.registerService.closeSession(user.restaurantId, user.sub);
  }

  @Get('current')
  async current(@CurrentUser() user: { restaurantId: string }) {
    return this.registerService.getCurrentSession(user.restaurantId);
  }

  @Get('summary/:sessionId')
  async summary(@Param('sessionId') sessionId: string) {
    return this.registerService.getSessionSummary(sessionId);
  }
}
