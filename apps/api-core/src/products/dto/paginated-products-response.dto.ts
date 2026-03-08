import { Product } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

export type PaginatedProductsResponseDto = PaginatedResult<Product>;
