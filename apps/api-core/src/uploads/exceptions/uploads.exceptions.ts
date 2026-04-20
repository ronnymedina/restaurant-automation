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

export class UnsupportedMimetypeException extends BaseException {
  constructor(mimetype: string) {
    super(
      `Unsupported mimetype: ${mimetype}. Allowed: image/jpeg, image/png, image/webp`,
      HttpStatus.BAD_REQUEST,
      'UNSUPPORTED_MIMETYPE',
    );
  }
}

export class InvalidUploadTokenException extends BaseException {
  constructor() {
    super(
      'Upload token is invalid or has expired',
      HttpStatus.UNAUTHORIZED,
      'INVALID_UPLOAD_TOKEN',
    );
  }
}
