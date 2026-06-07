import { registerAs } from '@nestjs/config';
import { CORS_ORIGIN } from '../config';

export const csrfConfig = registerAs('csrf', () => ({
  corsAllowedOrigins: CORS_ORIGIN,
}));
