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

/**
 * Thrown when a timezone is not available for a country.
 */
export class TimezoneNotAvailableForCountryException extends BaseException {
  constructor(timezone: string, country: string) {
    super(
      `La zona horaria '${timezone}' no está disponible para el país '${country}'`,
      HttpStatus.BAD_REQUEST,
      'TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY',
      { timezone, country },
    );
  }
}
