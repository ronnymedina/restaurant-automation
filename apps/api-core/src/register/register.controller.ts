import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { RegisterService } from './register.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller({ version: '1', path: 'register' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class RegisterController {
  constructor(private readonly registerService: RegisterService) { }

  @Post('open')
  async open(@CurrentUser() user: { restaurantId: string }) {
    return this.registerService.openSession(user.restaurantId);
  }

  @Post('close')
  async close(@CurrentUser() user: { restaurantId: string; id: string }) {
    return this.registerService.closeSession(user.restaurantId, user.id);
  }

  @Get('history')
  async history(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    return this.registerService.getSessionHistory(
      user.restaurantId,
      query.page,
      query.limit,
    );
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
