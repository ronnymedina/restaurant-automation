import { ExecutionContext } from '@nestjs/common';

import { CashShiftGuard } from './cash-shift.guard';
import { CashShiftRepository } from '../../cash-shift/cash-shift.repository';
import { CashRegisterNotFoundException } from '../exceptions/cash-register.exceptions';

const SESSION_ID = 'session-uuid';
const RESTAURANT_ID = 'restaurant-uuid';

const mockCashShiftRepository = {
  findById: jest.fn(),
};

function makeContext(sessionId: string, restaurantId: string): { ctx: ExecutionContext; req: Record<string, any> } {
  const req = { params: { sessionId }, user: { restaurantId } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('CashShiftGuard', () => {
  let guard: CashShiftGuard;

  beforeEach(() => {
    guard = new CashShiftGuard(mockCashShiftRepository as unknown as CashShiftRepository);
    jest.clearAllMocks();
  });

  it('lanza CashRegisterNotFoundException cuando la sesión no existe', async () => {
    mockCashShiftRepository.findById.mockResolvedValue(null);
    const { ctx } = makeContext(SESSION_ID, RESTAURANT_ID);

    await expect(guard.canActivate(ctx)).rejects.toThrow(CashRegisterNotFoundException);
  });

  it('lanza CashRegisterNotFoundException cuando la sesión pertenece a otro restaurante', async () => {
    mockCashShiftRepository.findById.mockResolvedValue({ id: SESSION_ID, restaurantId: 'otro-id' });
    const { ctx } = makeContext(SESSION_ID, RESTAURANT_ID);

    await expect(guard.canActivate(ctx)).rejects.toThrow(CashRegisterNotFoundException);
  });

  it('retorna true y adjunta cashShift al request cuando la sesión es válida', async () => {
    const session = { id: SESSION_ID, restaurantId: RESTAURANT_ID };
    mockCashShiftRepository.findById.mockResolvedValue(session);
    const { ctx, req } = makeContext(SESSION_ID, RESTAURANT_ID);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.cashShift).toEqual(session);
  });
});
