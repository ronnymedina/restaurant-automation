import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class InvalidActivationTokenException extends BaseException {
  constructor() {
    super(
      'Invalid or expired activation token',
      HttpStatus.BAD_REQUEST,
      'INVALID_ACTIVATION_TOKEN',
    );
  }
}

export class UserAlreadyActiveException extends BaseException {
  constructor(email: string) {
    super(
      'User account is already active',
      HttpStatus.CONFLICT,
      'USER_ALREADY_ACTIVE',
      { email },
    );
  }
}
