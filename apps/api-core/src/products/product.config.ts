import { registerAs } from '@nestjs/config';
import { BATCH_SIZE } from '../config';

export const productConfig = registerAs('product', () => ({
  batchSize: BATCH_SIZE,
}));
