import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RestaurantsService } from '../../restaurants/restaurants.service';
import { KitchenTokenService, MAX_KITCHEN_TOKEN_LENGTH } from '../kitchen-token.service';

export const KITCHEN_RESTAURANT_KEY = 'kitchenRestaurant';

@Injectable()
export class KitchenTokenGuard implements CanActivate {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly tokenService: KitchenTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const slug = req.params['slug'] as string;
    const token = this.extractToken(req);

    if (!slug || !token) throw new UnauthorizedException('Kitchen token required');
    if (token.length > MAX_KITCHEN_TOKEN_LENGTH) {
      throw new UnauthorizedException('Invalid kitchen token');
    }

    const restaurant = await this.restaurantsService.findBySlugWithSettings(slug);
    const storedHash = restaurant?.settings?.kitchenTokenHash;
    if (!restaurant || !storedHash) {
      throw new UnauthorizedException('Invalid kitchen token');
    }

    const candidateHash = this.tokenService.hash(token);
    if (!this.tokenService.verifyHash(storedHash, candidateHash)) {
      throw new UnauthorizedException('Invalid kitchen token');
    }

    const expiresAt = restaurant.settings?.kitchenTokenExpiresAt;
    if (expiresAt && expiresAt < new Date()) {
      throw new UnauthorizedException('Kitchen token expired');
    }

    (req as any)[KITCHEN_RESTAURANT_KEY] = restaurant;
    return true;
  }

  /**
   * Extracts the kitchen token from the `X-Kitchen-Token` request header.
   * The legacy `?token=` query-string fallback was removed in the H-04 cookie
   * auth migration to keep secrets out of URLs, browser history, Referer,
   * and upstream proxy logs. SSE callers that cannot set headers via the
   * native EventSource API must use `fetchEventSource` from
   * `@microsoft/fetch-event-source` instead (kitchen UI does this).
   */
  private extractToken(req: Request): string | undefined {
    const header = req.headers['x-kitchen-token'];
    if (typeof header === 'string' && header.length > 0) return header;
    return undefined;
  }
}
