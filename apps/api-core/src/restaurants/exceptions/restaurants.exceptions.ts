import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

/**
 * Thrown when attempting to create a duplicate restaurant.
 */
export class DuplicateRestaurantException extends BaseException {
  constructor(restaurantName: string) {
    super(
      `Restaurant '${restaurantName}' already exists`,
      HttpStatus.CONFLICT,
      'DUPLICATE_RESTAURANT',
      { restaurantName },
    );
  }
}
