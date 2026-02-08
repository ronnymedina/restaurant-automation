import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

/**
 * Thrown when a Gemini API call fails.
 */
export class GeminiApiException extends BaseException {
  constructor(operation: string, originalError?: string) {
    super(
      `Gemini API error during ${operation}`,
      HttpStatus.BAD_GATEWAY,
      'GEMINI_API_ERROR',
      { operation, originalError },
    );
  }
}

/**
 * Thrown when image processing fails.
 */
export class ImageProcessingException extends BaseException {
  constructor(reason: string, mimeType?: string) {
    super(
      `Image processing failed: ${reason}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'IMAGE_PROCESSING_ERROR',
      mimeType ? { mimeType } : undefined,
    );
  }
}
