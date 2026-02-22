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

export class EmailAlreadyExistsException extends BaseException {
  constructor(email: string) {
    super(
      'A user with this email already exists',
      HttpStatus.CONFLICT,
      'EMAIL_ALREADY_EXISTS',
      { email },
    );
  }
}

export class InvalidRoleException extends BaseException {
  constructor(role: string) {
    super(
      `Role '${role}' is not allowed for user creation`,
      HttpStatus.BAD_REQUEST,
      'INVALID_ROLE',
      { role },
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
