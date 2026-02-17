import { registerAs } from '@nestjs/config';
import {
  JWT_SECRET,
  JWT_ACCESS_EXPIRATION,
  JWT_REFRESH_EXPIRATION,
} from '../config';

export const authConfig = registerAs('auth', () => ({
  jwtSecret: JWT_SECRET,
  jwtAccessExpiration: JWT_ACCESS_EXPIRATION,
  jwtRefreshExpiration: JWT_REFRESH_EXPIRATION,
}));
