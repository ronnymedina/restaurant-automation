import { registerAs } from '@nestjs/config';
import { BATCH_SIZE, DEFAULT_PAGE_SIZE } from '../config';

export const productConfig = registerAs('product', () => ({
  batchSize: BATCH_SIZE,
  defaultPageSize: DEFAULT_PAGE_SIZE,
}));
