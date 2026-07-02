import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RestaurantsService } from '../../restaurants/restaurants.service';
import { SINGLE_RESTAURANT_MODE } from '../../config';
import { registrationOpen } from '../onboarding-registration';
import { OnboardingClosedException } from '../exceptions/onboarding.exceptions';

/**
 * Bloquea POST /onboarding/register cuando el registro público está cerrado
 * (modo single-restaurant con un restaurante ya registrado). Corre antes de
 * parsear el upload, así que el rechazo es barato.
 */
@Injectable()
export class OnboardingOpenGuard implements CanActivate {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const count = await this.restaurantsService.count();
    if (!registrationOpen(SINGLE_RESTAURANT_MODE, count)) {
      throw new OnboardingClosedException();
    }
    return true;
  }
}
