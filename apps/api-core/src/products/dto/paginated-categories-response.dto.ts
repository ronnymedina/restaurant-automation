import { Category } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

export type PaginatedCategoriesResponseDto = PaginatedResult<Category>;
