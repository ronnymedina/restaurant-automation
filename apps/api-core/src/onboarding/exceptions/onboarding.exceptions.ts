import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

/**
 * Thrown when the onboarding process fails unexpectedly.
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
