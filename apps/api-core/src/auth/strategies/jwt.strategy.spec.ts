import { Test } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { authConfig } from '../auth.config';
import type { Request } from 'express';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '7d';
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: authConfig.KEY, useValue: authConfig() },
      ],
    }).compile();
    strategy = moduleRef.get(JwtStrategy);
  });

  function extract(req: Partial<Request>): string | null {
    // access private _jwtFromRequest extractor for test
    const fn = (strategy as unknown as { _jwtFromRequest: (r: Request) => string | null })
      ._jwtFromRequest;
    return fn(req as Request);
  }

  it('reads token from req.cookies.access_token', () => {
    expect(extract({ cookies: { access_token: 'jwt-here' } })).toBe('jwt-here');
  });

  it('returns null when cookie is missing', () => {
    expect(extract({ cookies: {} })).toBeNull();
    expect(extract({})).toBeNull();
  });

  it('ignores Authorization Bearer headers', () => {
    expect(extract({ headers: { authorization: 'Bearer jwt-from-header' }, cookies: {} })).toBeNull();
  });

  it('validate maps payload to user shape', () => {
    expect(strategy.validate({ sub: 'u1', email: 'e@x', role: 'ADMIN', restaurantId: 'r1' })).toEqual({
      id: 'u1',
      email: 'e@x',
      role: 'ADMIN',
      restaurantId: 'r1',
    });
  });
});
