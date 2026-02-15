import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

/**
 * Thrown when the onboarding process fails.
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
