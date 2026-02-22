import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class RegisterAlreadyOpenException extends BaseException {
  constructor() {
    super(
      'A register session is already open',
      HttpStatus.CONFLICT,
      'REGISTER_ALREADY_OPEN',
    );
  }
}

export class RegisterNotFoundException extends BaseException {
  constructor(sessionId: string) {
    super(
      `Register session '${sessionId}' not found`,
      HttpStatus.NOT_FOUND,
      'REGISTER_NOT_FOUND',
      { sessionId },
    );
  }
}

export class NoOpenRegisterException extends BaseException {
  constructor() {
    super(
      'No register session is currently open',
      HttpStatus.CONFLICT,
      'NO_OPEN_REGISTER',
    );
  }
}
