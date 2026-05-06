import { Controller, Patch, Get, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RestaurantsService } from './restaurants.service';
import { RenameRestaurantDto } from './dto/rename-restaurant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller({ version: '1', path: 'restaurants' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) { }

  @Get('settings')
  @ApiOperation({ summary: 'Get restaurant settings including timezone' })
  async getSettings(
    @CurrentUser() user: { restaurantId: string },
  ): Promise<{ timezone: string }> {
    const restaurant = await this.restaurantsService.findByIdWithSettings(user.restaurantId);
    return { timezone: restaurant?.settings?.timezone ?? 'UTC' };
  }

  @Patch('name')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename the restaurant (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'New slug generated', schema: { example: { slug: 'mi-restaurante-nuevo' } } })
  async rename(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: RenameRestaurantDto,
  ): Promise<{ slug: string }> {
    const updated = await this.restaurantsService.rename(user.restaurantId, dto.name);
    return { slug: updated.slug };
  }

}
