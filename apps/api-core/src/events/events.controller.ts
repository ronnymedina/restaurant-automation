import {
  Controller,
  Headers,
  MessageEvent,
  Query,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { SseService } from './sse.service';
import { KitchenTokenService, MAX_KITCHEN_TOKEN_LENGTH } from '../kitchen/kitchen-token.service';

@Controller({ version: '1', path: 'events' })
export class EventsController {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly sseService: SseService,
    private readonly kitchenTokenService: KitchenTokenService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Sse('dashboard')
  dashboard(@CurrentUser() user: { restaurantId: string }): Observable<MessageEvent> {
    return this.sseService.streamForRestaurant(user.restaurantId);
  }

  @Public()
  @Sse('kitchen')
  async kitchen(
    @Headers('x-kitchen-token') token: string | undefined,
    @Query('slug') slug: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    if (!slug || !token) {
      throw new UnauthorizedException();
    }

    if (token.length > MAX_KITCHEN_TOKEN_LENGTH) {
      throw new UnauthorizedException();
    }

    const restaurant = await this.restaurantsService.findBySlugWithSettings(slug);
    if (!restaurant || !restaurant.settings) {
      throw new UnauthorizedException();
    }

    const storedHash = restaurant.settings.kitchenTokenHash;
    if (!storedHash) {
      throw new UnauthorizedException();
    }

    const candidateHash = this.kitchenTokenService.hash(token);
    if (!this.kitchenTokenService.verifyHash(storedHash, candidateHash)) {
      throw new UnauthorizedException();
    }

    const expiresAt = restaurant.settings.kitchenTokenExpiresAt;
    if (expiresAt && expiresAt < new Date()) {
      throw new UnauthorizedException();
    }

    return this.sseService.streamForKitchen(restaurant.id);
  }
}
