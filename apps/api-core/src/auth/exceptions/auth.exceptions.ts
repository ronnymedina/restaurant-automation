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
    super(
      'Account is not active',
      HttpStatus.FORBIDDEN,
      'ACCOUNT_INACTIVE',
    );
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
