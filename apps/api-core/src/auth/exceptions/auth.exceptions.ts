import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class InvalidCredentialsException extends BaseException {
  constructor() {
    super(
      'Invalid email or password',
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
    );
  }
}

export class InactiveAccountException extends BaseException {
  constructor() {
    super('Account is not active', HttpStatus.FORBIDDEN, 'ACCOUNT_INACTIVE');
  }
}

export class InvalidRefreshTokenException extends BaseException {
  constructor() {
    super(
      'Invalid or expired refresh token',
      HttpStatus.UNAUTHORIZED,
      'INVALID_REFRESH_TOKEN',
    );
  }
}

export class OriginRequiredException extends BaseException {
  constructor() {
    super(
      'Origin or Referer header is required for this request',
      HttpStatus.FORBIDDEN,
      'ORIGIN_REQUIRED',
    );
  }
}

export class OriginNotAllowedException extends BaseException {
  constructor() {
    super(
      'Request Origin is not in the allowlist',
      HttpStatus.FORBIDDEN,
      'ORIGIN_NOT_ALLOWED',
    );
  }
}
