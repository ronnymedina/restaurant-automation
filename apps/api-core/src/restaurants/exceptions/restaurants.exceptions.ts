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

/**
 * Thrown when a restaurant is not found.
 */
export class RestaurantNotFoundException extends BaseException {
  constructor(restaurantId: string) {
    super(
      `Restaurant '${restaurantId}' not found`,
      HttpStatus.NOT_FOUND,
      'RESTAURANT_NOT_FOUND',
      { restaurantId },
    );
  }
}
