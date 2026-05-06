import { Controller, MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';

import { Public } from '../auth/decorators/public.decorator';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { SseService } from './sse.service';

@Controller({ version: '1', path: 'events' })
export class EventsController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly restaurantsService: RestaurantsService,
    private readonly sseService: SseService,
  ) {}

  @Public()
  @Sse('dashboard')
  dashboard(@Query('token') token: string | undefined): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: { restaurantId?: string };
    try {
      payload = this.jwtService.verify<{ restaurantId?: string }>(token);
    } catch {
      throw new UnauthorizedException();
    }

    if (!payload.restaurantId) {
      throw new UnauthorizedException();
    }

    return this.sseService.streamForRestaurant(payload.restaurantId);
  }

  @Public()
  @Sse('kitchen')
  async kitchen(
    @Query('token') token: string | undefined,
    @Query('slug') slug: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    if (!slug || !token) {
      throw new UnauthorizedException();
    }

    const restaurant = await this.restaurantsService.findBySlugWithSettings(slug);

    if (!restaurant || !restaurant.settings) {
      throw new UnauthorizedException();
    }

    if (restaurant.settings.kitchenToken !== token) {
      throw new UnauthorizedException();
    }

    const expiresAt = restaurant.settings.kitchenTokenExpiresAt;
    if (expiresAt && expiresAt < new Date()) {
      throw new UnauthorizedException();
    }

    return this.sseService.streamForKitchen(restaurant.id);
  }
}
