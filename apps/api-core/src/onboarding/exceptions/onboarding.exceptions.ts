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
 * Thrown when product extraction from photos fails.
 */
export class PhotoExtractionException extends BaseException {
  constructor(reason: string, photoCount?: number) {
    super(
      `Failed to extract products from photos: ${reason}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'PHOTO_EXTRACTION_FAILED',
      photoCount !== undefined ? { photoCount } : undefined,
    );
  }
}
