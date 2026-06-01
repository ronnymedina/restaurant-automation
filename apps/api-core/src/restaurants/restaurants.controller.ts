import { Controller, Patch, Get, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';
import { RestaurantSettingsDto, DEFAULT_RESTAURANT_SETTINGS } from './dto/restaurant-settings.dto';
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

  @Get('settings')
  @ApiOperation({ summary: 'Get restaurant settings (name, slug + display preferences)' })
  @ApiResponse({ status: 200, type: RestaurantSettingsDto })
  async getSettings(
    @CurrentUser() user: { restaurantId: string },
  ): Promise<RestaurantSettingsDto> {
    const restaurant = await this.restaurantsService.findByIdWithSettings(user.restaurantId);
    if (!restaurant || !restaurant.settings) return DEFAULT_RESTAURANT_SETTINGS;
    return {
      name: restaurant.name,
      slug: restaurant.slug,
      timezone: restaurant.settings.timezone,
      country: restaurant.settings.country,
      currency: restaurant.settings.currency,
      decimalSeparator: restaurant.settings.decimalSeparator,
      thousandsSeparator: restaurant.settings.thousandsSeparator,
    };
  }

  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update restaurant settings (name, timezone, currency, decimalSeparator). ADMIN only.' })
  @ApiResponse({ status: 200, type: RestaurantSettingsDto })
  @ApiResponse({ status: 400, description: 'Validación de shape o regla timezone ↔ country' })
  @ApiResponse({ status: 403, description: 'No es ADMIN' })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  @ApiResponse({ status: 409, description: 'Slug duplicado al regenerar a partir del nuevo nombre' })
  async updateSettings(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateRestaurantSettingsDto,
  ): Promise<RestaurantSettingsDto> {
    return this.restaurantsService.updateSettings(user.restaurantId, dto);
  }
}
