import { registerAs } from '@nestjs/config';
import { BCRYPT_SALT_ROUNDS } from '../config';

export const userConfig = registerAs('user', () => ({
  bcryptSaltRounds: BCRYPT_SALT_ROUNDS,
}));
