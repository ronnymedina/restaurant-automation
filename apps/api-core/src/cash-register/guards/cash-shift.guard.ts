import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { CashShiftRepository } from '../../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from '../exceptions/cash-register.exceptions';

@Injectable()
export class CashShiftGuard implements CanActivate {
  constructor(private readonly cashShiftRepository: CashShiftRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user: { restaurantId: string }; cashShift: unknown }>();
    const sessionId = req.params['sessionId'] as string;
    const { restaurantId } = req.user;

    const session = await this.cashShiftRepository.findById(sessionId);
    if (!session || session.restaurantId !== restaurantId) {
      throw new CashRegisterNotFoundException(sessionId);
    }

    req.cashShift = session;
    return true;
  }
}
