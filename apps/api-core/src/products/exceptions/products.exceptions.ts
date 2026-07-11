import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

/**
 * Thrown when attempting to create a duplicate product.
 */
export class DuplicateProductException extends BaseException {
  constructor(productName: string, restaurantId: string) {
    super(
      `Product '${productName}' already exists in this restaurant`,
      HttpStatus.CONFLICT,
      'DUPLICATE_PRODUCT',
      { productName, restaurantId },
    );
  }
}

export class InsufficientStockException extends BaseException {
  constructor(productName: string, available: number, requested: number) {
    super(
      `Insufficient stock for product '${productName}'. Available: ${available}, requested: ${requested}`,
      HttpStatus.CONFLICT,
      'INSUFFICIENT_STOCK',
      { productName, available, requested },
    );
  }
}
