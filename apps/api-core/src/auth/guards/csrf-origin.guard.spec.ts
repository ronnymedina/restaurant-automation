import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfOriginGuard } from './csrf-origin.guard';

function ctx(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

describe('CsrfOriginGuard', () => {
  const allowed = ['https://resapp.daikulab.com'];
  let guard: CsrfOriginGuard;
  beforeEach(() => {
    guard = new CsrfOriginGuard({ corsAllowedOrigins: allowed } as any);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows safe method %s with no Origin', (method) => {
    expect(guard.canActivate(ctx({ method, headers: {} }))).toBe(true);
  });

  it('allows POST with allowlisted Origin', () => {
    expect(guard.canActivate(ctx({
      method: 'POST',
      headers: { origin: 'https://resapp.daikulab.com' },
    }))).toBe(true);
  });

  it('rejects POST with foreign Origin', () => {
    expect(() => guard.canActivate(ctx({
      method: 'POST',
      headers: { origin: 'https://malicioso.com' },
    }))).toThrow(ForbiddenException);
  });

  it('rejects POST without Origin or Referer', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', headers: {} }))).toThrow(ForbiddenException);
  });

  it('falls back to Referer origin when Origin is missing', () => {
    expect(guard.canActivate(ctx({
      method: 'POST',
      headers: { referer: 'https://resapp.daikulab.com/dash/orders' },
    }))).toBe(true);
  });

  it('rejects POST with malformed Referer and no Origin', () => {
    expect(() => guard.canActivate(ctx({
      method: 'POST',
      headers: { referer: 'not-a-url' },
    }))).toThrow(ForbiddenException);
  });
});
