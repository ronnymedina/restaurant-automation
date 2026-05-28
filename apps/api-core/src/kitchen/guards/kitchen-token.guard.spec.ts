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

  it('accepts a valid token via X-Kitchen-Token header', async () => {
    const { plainToken, tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
    });
    const req: any = { params: { slug: 'mi-rest' }, query: {}, headers: { 'x-kitchen-token': plainToken } };

    expect(await guard.canActivate(buildContext(req))).toBe(true);
    expect(req[KITCHEN_RESTAURANT_KEY]).toBeTruthy();
  });

  it('accepts a valid token via query string (legacy)', async () => {
    const { plainToken, tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
    });
    const req: any = { params: { slug: 'mi-rest' }, query: { token: plainToken }, headers: {} };

    expect(await guard.canActivate(buildContext(req))).toBe(true);
  });

  it('header takes precedence over query', async () => {
    const { plainToken: correct, tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
    });
    const req: any = {
      params: { slug: 'mi-rest' },
      query: { token: 'wrong' },
      headers: { 'x-kitchen-token': correct },
    };

    expect(await guard.canActivate(buildContext(req))).toBe(true);
  });

  it('rejects when no token in header or query', async () => {
    const req: any = { params: { slug: 'mi-rest' }, query: {}, headers: {} };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when slug missing', async () => {
    const req: any = { params: {}, query: { token: 'x' }, headers: {} };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token longer than MAX_TOKEN_LENGTH without calling restaurantsService', async () => {
    const req: any = {
      params: { slug: 'mi-rest' },
      query: { token: 'a'.repeat(2000) },
      headers: {},
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
    expect(restaurantsService.findBySlugWithSettings).not.toHaveBeenCalled();
  });

  it('rejects when restaurant has no kitchenTokenHash', async () => {
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: null },
    });
    const req: any = { params: { slug: 'mi-rest' }, query: { token: 'x' }, headers: {} };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects mismatching token', async () => {
    const { tokenHash } = tokenService.generate();
    restaurantsService.findBySlugWithSettings.mockResolvedValue({
      id: 'r1',
      settings: { kitchenTokenHash: tokenHash, kitchenTokenExpiresAt: null },
    });
    const req: any = { params: { slug: 'mi-rest' }, query: { token: 'wrong-token' }, headers: {} };
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
    const req: any = { params: { slug: 'mi-rest' }, query: { token: plainToken }, headers: {} };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });
});
