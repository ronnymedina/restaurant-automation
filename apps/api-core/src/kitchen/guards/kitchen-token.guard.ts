import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RestaurantsService } from '../../restaurants/restaurants.service';

export const KITCHEN_RESTAURANT_KEY = 'kitchenRestaurant';

@Injectable()
export class KitchenTokenGuard implements CanActivate {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const slug = req.params['slug'] as string;
    const token = req.query['token'] as string | undefined;

    if (!slug || !token) throw new UnauthorizedException('Kitchen token required');

    const restaurant = await this.restaurantsService.findBySlugWithSettings(slug);
    if (!restaurant || restaurant.settings?.kitchenToken !== token) {
      throw new UnauthorizedException('Invalid kitchen token');
    }

    if (restaurant.settings?.kitchenTokenExpiresAt && restaurant.settings.kitchenTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Kitchen token expired');
    }

    (req as any)[KITCHEN_RESTAURANT_KEY] = restaurant;
    return true;
  }
}
