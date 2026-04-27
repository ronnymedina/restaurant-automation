import { Controller, MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';

import { Public } from '../auth/decorators/public.decorator';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { SseService } from './sse.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly restaurantsService: RestaurantsService,
    private readonly sseService: SseService,
  ) {}

  @Public()
  @Sse('dashboard')
  dashboard(@Query('token') token: string): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: { restaurantId: string };
    try {
      payload = this.jwtService.verify<{ restaurantId: string }>(token);
    } catch {
      throw new UnauthorizedException();
    }

    return this.sseService.streamForRestaurant(payload.restaurantId);
  }

  @Public()
  @Sse('kitchen')
  async kitchen(
    @Query('token') token: string,
    @Query('slug') slug: string,
  ): Promise<Observable<MessageEvent>> {
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
