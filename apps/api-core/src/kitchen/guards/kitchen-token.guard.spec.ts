import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { KitchenTokenGuard, KITCHEN_RESTAURANT_KEY } from './kitchen-token.guard';
import { KitchenTokenService } from '../kitchen-token.service';

function buildContext(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('KitchenTokenGuard', () => {
  let guard: KitchenTokenGuard;
  let restaurantsService: { findBySlugWithSettings: jest.Mock };
  let tokenService: KitchenTokenService;

  beforeEach(() => {
    restaurantsService = { findBySlugWithSettings: jest.fn() };
    tokenService = new KitchenTokenService();
    guard = new KitchenTokenGuard(restaurantsService as any, tokenService);
  });

  it('accepts X-Kitchen-Token header', async () => {
    const { plainToken, tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
    });
    const req: any = {
      params: { slug: 'mi-rest' },
      query: {},
      headers: { 'x-kitchen-token': plainToken },
    };

    expect(await guard.canActivate(buildContext(req))).toBe(true);
    expect(req[KITCHEN_RESTAURANT_KEY]).toBeTruthy();
  });

  it('rejects when the kitchen token is only present in ?token= query', async () => {
    const { plainToken, tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
    });
    const req: any = {
      params: { slug: 'mi-rest' },
      query: { token: plainToken },
      headers: {},
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when no token in header', async () => {
    const req: any = { params: { slug: 'mi-rest' }, query: {}, headers: {} };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when slug missing', async () => {
    const req: any = {
      params: {},
      query: {},
      headers: { 'x-kitchen-token': 'x' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token longer than MAX_TOKEN_LENGTH without calling restaurantsService', async () => {
    const req: any = {
      params: { slug: 'mi-rest' },
      query: {},
      headers: { 'x-kitchen-token': 'a'.repeat(2000) },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
    expect(restaurantsService.findBySlugWithSettings).not.toHaveBeenCalled();
  });

  it('rejects when restaurant has no kitchenTokenHash', async () => {
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: null },
    });
    const req: any = {
      params: { slug: 'mi-rest' },
      query: {},
      headers: { 'x-kitchen-token': 'x' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects mismatching token', async () => {
    const { tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
    });
    const req: any = {
      params: { slug: 'mi-rest' },
      query: {},
      headers: { 'x-kitchen-token': 'wrong-token' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects expired token', async () => {
    const { plainToken, tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: {
        kitchenTokenHash: tokenHash,
        kitchenTokenExpiresAt: new Date(Date.now() - 1000),
      },
    });
    const req: any = {
      params: { slug: 'mi-rest' },
      query: {},
      headers: { 'x-kitchen-token': plainToken },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });
});
