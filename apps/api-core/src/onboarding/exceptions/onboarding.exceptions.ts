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
