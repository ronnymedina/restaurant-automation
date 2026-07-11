import type { CookieOptions } from 'express';

export const COOKIE_NAMES = {
  access: 'access_token',
  refresh: 'refresh_token',
} as const;

export const COOKIE_PATHS = {
  access: '/',
  refresh: '/v1/auth',
} as const;

interface BaseInput {
  domain: string;
  secure: boolean;
}

interface AccessInput extends BaseInput {
  accessMaxAge: number;
}

interface RefreshInput extends BaseInput {
  refreshMaxAge: number;
}

interface ClearInput extends BaseInput {
  name: keyof typeof COOKIE_NAMES;
}

function withOptionalDomain<T extends CookieOptions>(opts: T, domain: string): T {
  if (!domain) return opts;
  return { ...opts, domain };
}

export function buildAccessCookieOptions(input: AccessInput): CookieOptions {
  return withOptionalDomain(
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: input.secure,
      path: COOKIE_PATHS.access,
      maxAge: input.accessMaxAge,
    },
    input.domain,
  );
}

export function buildRefreshCookieOptions(input: RefreshInput): CookieOptions {
  return withOptionalDomain(
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: input.secure,
      path: COOKIE_PATHS.refresh,
      maxAge: input.refreshMaxAge,
    },
    input.domain,
  );
}

export function buildClearOptions(input: ClearInput): CookieOptions {
  return withOptionalDomain(
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: input.secure,
      path: COOKIE_PATHS[input.name],
    },
    input.domain,
  );
}
