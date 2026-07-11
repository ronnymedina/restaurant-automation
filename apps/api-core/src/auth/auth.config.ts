import { registerAs } from '@nestjs/config';
import {
  JWT_SECRET,
  JWT_ACCESS_EXPIRATION,
  JWT_REFRESH_EXPIRATION,
  COOKIE_DOMAIN,
  COOKIE_SECURE,
  COOKIE_ACCESS_MAX_AGE,
  COOKIE_REFRESH_MAX_AGE,
} from '../config';

export const authConfig = registerAs('auth', () => ({
  jwtSecret: JWT_SECRET,
  jwtAccessExpiration: JWT_ACCESS_EXPIRATION,
  jwtRefreshExpiration: JWT_REFRESH_EXPIRATION,
  cookieDomain: COOKIE_DOMAIN,
  cookieSecure: COOKIE_SECURE,
  cookieAccessMaxAge: COOKIE_ACCESS_MAX_AGE,
  cookieRefreshMaxAge: COOKIE_REFRESH_MAX_AGE,
}));
