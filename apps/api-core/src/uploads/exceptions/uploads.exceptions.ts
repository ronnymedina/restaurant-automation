import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

/**
 * Thrown when uploading an image to the remote storage provider fails.
 */
export class ImageUploadFailedException extends BaseException {
  constructor() {
    super(
      'Failed to upload image to storage',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'IMAGE_UPLOAD_FAILED',
    );
  }
}
