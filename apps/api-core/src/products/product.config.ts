import { registerAs } from '@nestjs/config';
import { BATCH_SIZE, PRODUCTS_MAX_PAGE_SIZE, PRODUCTS_DEFAULT_CATEGORY_NAME } from '../config';

export const productConfig = registerAs('product', () => ({
  batchSize: BATCH_SIZE,
  maxPageSize: PRODUCTS_MAX_PAGE_SIZE,
  defaultCategoryName: PRODUCTS_DEFAULT_CATEGORY_NAME,
}));
