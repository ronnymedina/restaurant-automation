import { buildAccessCookieOptions, buildRefreshCookieOptions, buildClearOptions, COOKIE_NAMES } from './auth-cookies';

describe('auth-cookies', () => {
  const base = { domain: '.daikulab.com', secure: true, accessMaxAge: 900_000, refreshMaxAge: 604_800_000 };

  it('exposes stable cookie names', () => {
    expect(COOKIE_NAMES.access).toBe('access_token');
    expect(COOKIE_NAMES.refresh).toBe('refresh_token');
  });

  it('access cookie options are httpOnly, Lax, Secure, Path=/ and scoped to domain', () => {
    const opts = buildAccessCookieOptions(base);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 900_000,
      domain: '.daikulab.com',
    });
  });

  it('refresh cookie options are Path=/v1/auth and use refresh max-age', () => {
    const opts = buildRefreshCookieOptions(base);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/v1/auth',
      maxAge: 604_800_000,
    });
  });

  it('omits the domain attribute when domain is empty (dev)', () => {
    const opts = buildAccessCookieOptions({ ...base, domain: '' });
    expect(opts).not.toHaveProperty('domain');
  });

  it('buildClearOptions returns matching path + domain, no maxAge', () => {
    const clearAccess = buildClearOptions({ ...base, name: 'access' });
    expect(clearAccess).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      domain: '.daikulab.com',
    });
    const clearRefresh = buildClearOptions({ ...base, name: 'refresh' });
    expect(clearRefresh.path).toBe('/v1/auth');
  });
});
