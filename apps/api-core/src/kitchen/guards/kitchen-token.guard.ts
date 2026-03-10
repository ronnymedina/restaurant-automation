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
    const slug = req.params['slug'];
    const token = req.query['token'] as string | undefined;

    if (!slug || !token) throw new UnauthorizedException('Kitchen token required');

    const restaurant = await this.restaurantsService.findBySlug(slug);
    if (!restaurant || restaurant.kitchenToken !== token) {
      throw new UnauthorizedException('Invalid kitchen token');
    }

    if (restaurant.kitchenTokenExpiresAt && restaurant.kitchenTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Kitchen token expired');
    }

    req[KITCHEN_RESTAURANT_KEY] = restaurant;
    return true;
  }
}
