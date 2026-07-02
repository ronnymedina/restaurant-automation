import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

/**
 * Thrown when the onboarding process fails unexpectedly.
 * code: `ONBOARDING_FAILED` · HTTP 500. Ver docs/onboarding-error-mapping.md.
 */
export class OnboardingFailedException extends BaseException {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      `Onboarding failed: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'ONBOARDING_FAILED',
      details,
    );
  }
}

/**
 * Thrown when a registration attempt uses an email that already exists.
 * code: `EMAIL_ALREADY_EXISTS` · HTTP 409 · details: `{ email }`.
 */
export class EmailAlreadyExistsException extends BaseException {
  constructor(email: string) {
    super(
      `Email '${email}' is already registered`,
      HttpStatus.CONFLICT,
      'EMAIL_ALREADY_EXISTS',
      { email },
    );
  }
}

/**
 * Thrown when the restaurant cannot be created during onboarding.
 * code: `RESTAURANT_CREATION_FAILED` · HTTP 500 · details: `{ restaurantName }`.
 */
export class RestaurantCreationFailedException extends BaseException {
  constructor(details?: Record<string, unknown>) {
    super(
      'Failed to create the restaurant',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'RESTAURANT_CREATION_FAILED',
      details,
    );
  }
}

/**
 * Thrown when the user cannot be created during onboarding.
 * code: `USER_CREATION_FAILED` · HTTP 500 · details: `{ email, restaurantName }`.
 */
export class UserCreationFailedException extends BaseException {
  constructor(details?: Record<string, unknown>) {
    super(
      'Failed to create the user account',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'USER_CREATION_FAILED',
      details,
    );
  }
}

/**
 * Thrown when the default category cannot be created during onboarding.
 * code: `DEFAULT_CATEGORY_CREATION_FAILED` · HTTP 500 · details: `{ restaurantId }`.
 */
export class DefaultCategoryCreationFailedException extends BaseException {
  constructor(details?: Record<string, unknown>) {
    super(
      'Failed to create the default category',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'DEFAULT_CATEGORY_CREATION_FAILED',
      details,
    );
  }
}

/**
 * Thrown when public onboarding registration is closed on this instance
 * (single-restaurant mode with a restaurant already registered).
 * code: `ONBOARDING_CLOSED` · HTTP 403. Ver docs/onboarding-error-mapping.md.
 */
export class OnboardingClosedException extends BaseException {
  constructor() {
    super(
      'Onboarding registration is closed on this instance',
      HttpStatus.FORBIDDEN,
      'ONBOARDING_CLOSED',
    );
  }
}

