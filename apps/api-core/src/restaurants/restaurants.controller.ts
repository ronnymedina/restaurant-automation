import { Controller, Patch, Body, UseGuards, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RestaurantsService } from './restaurants.service';
import { RenameRestaurantDto } from './dto/rename-restaurant.dto';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller({ version: '1', path: 'restaurants' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Patch('name')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename the restaurant (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'New slug generated', schema: { example: { slug: 'mi-restaurante-nuevo' } } })
  async rename(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: RenameRestaurantDto,
  ): Promise<{ slug: string }> {
    const updated = await this.restaurantsService.update(user.restaurantId, { name: dto.name });
    return { slug: updated.slug };
  }

  @Get('settings')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get restaurant settings' })
  async getSettings(@CurrentUser() user: { restaurantId: string }) {
    const restaurant = await this.restaurantsService.findById(user.restaurantId);
    return { defaultReservationDuration: restaurant!.defaultReservationDuration };
  }

  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update restaurant settings (ADMIN only)' })
  @ApiResponse({ status: 200 })
  async updateSettings(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateRestaurantSettingsDto,
  ) {
    const data: Record<string, unknown> = {};
    if (dto.defaultReservationDuration !== undefined) {
      data.defaultReservationDuration = dto.defaultReservationDuration;
    }
    return this.restaurantsService.update(user.restaurantId, data);
  }
}
