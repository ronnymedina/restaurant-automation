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
